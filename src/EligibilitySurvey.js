import React, { useState, useEffect, useCallback, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

const EligibilityScreener = () => {
  const { programs = [], criteria = [], questions = [] } = surveyData || {};

  const userResponses = useRef({});
  const [eligiblePrograms, setEligiblePrograms] = useState(new Set(programs.map((p) => p.id)));
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const [surveyModel, setSurveyModel] = useState(null);
  const [evaluationPending, setEvaluationPending] = useState(false); // Tracks pending evaluations

  // Criteria thresholds for eligiblity evaluation
  const meetsCriterion = useCallback((criterion, answer, householdSize) => {
    if (!criterion) return true;

    if (criterion.threshold_by_household_size && householdSize) {
      const threshold = criterion.threshold_by_household_size[householdSize];
      return criterion.comparison === "<=" ? answer <= threshold : answer >= threshold;
    }

    if (criterion.threshold !== undefined) {
      return criterion.comparison === "<=" ? answer <= criterion.threshold : answer >= criterion.threshold;
    }

    if (criterion.options) {
      return criterion.options.includes(answer);
    }

    return true;
  }, []);

  const evaluateCriteriaGroup = useCallback((criteriaGroup, programId) => {
    if (!criteriaGroup) return true;

    // Handle simple criteria ID (string)
    if (typeof criteriaGroup === 'string') {
      const criterion = criteria.find(c => c.id === criteriaGroup);
      const question = questions.find(q =>
        q.criteria_impact.some(ci => ci.criteria_id === criteriaGroup)
      );
      
      if (!question) {
        console.warn(`No question found for criterion "${criteriaGroup}" in program "${programId}"`);
        return true;
      }

      const questionName = question.question;
      const userAnswer = userResponses.current[questionName];
      const householdSize = userResponses.current["What is your household size?"];

      return meetsCriterion(criterion, userAnswer, householdSize);
    }

    // Handle nested criteria groups
    switch (criteriaGroup.type) {
      case 'all_of':
        return criteriaGroup.criteria_ids.every(subCriteria => 
          evaluateCriteriaGroup(subCriteria, programId)
        );
      
      case 'any_of':
        return criteriaGroup.criteria_ids.some(subCriteria => 
          evaluateCriteriaGroup(subCriteria, programId)
        );
      
      case 'income_based':
      case 'program_participation':
        return criteriaGroup.criteria_ids.some(subCriteria => 
          evaluateCriteriaGroup(subCriteria, programId)
        );
      
      default:
        console.warn(`Unknown criteria group type: ${criteriaGroup.type}`);
        return false;
    }
  }, [criteria, questions, meetsCriterion, userResponses]);

  const hasRequiredAnswers = useCallback((programId) => {
    const program = programs.find(p => p.id === programId);
    if (!program) return false;

    // Get all questions that impact this program
    const programQuestions = questions.filter(q =>
      q.criteria_impact.some(ci => ci.program_id === programId)
    );

    // Check if we have answers for all required questions
    return programQuestions.every(question => 
      userResponses.current[question.question] !== undefined
    );
  }, [programs, questions]);

  const evaluateEligibility = useCallback(() => {
    if (!surveyModel) {
      console.warn("Survey model not initialized. Deferring evaluation.");
      setEvaluationPending(true);
      return;
    }

    console.log("Evaluating eligibility...");
    const programEligibilityMap = {};

    // Only evaluate programs where we have all required answers
    programs.forEach((program) => {
      if (!hasRequiredAnswers(program.id)) {
        console.log(`Skipping evaluation for ${program.id} - missing required answers`);
        programEligibilityMap[program.id] = true; // Keep program eligible until we have all answers
        return;
      }

      // Evaluate based on program's criteria logic
      if (program.criteria_logic === 'AND') {
        programEligibilityMap[program.id] = program.criteria_ids.every(criteriaGroup =>
          evaluateCriteriaGroup(criteriaGroup, program.id)
        );
      } else if (program.criteria_logic === 'OR') {
        programEligibilityMap[program.id] = program.criteria_ids.some(criteriaGroup =>
          evaluateCriteriaGroup(criteriaGroup, program.id)
        );
      }

      console.log(`Program ${program.id} eligibility:`, programEligibilityMap[program.id]);
    });

    const updatedEligiblePrograms = new Set(
      Object.keys(programEligibilityMap).filter((programId) => programEligibilityMap[programId])
    );
    setEligiblePrograms(updatedEligiblePrograms);

    // Only show final results if we're on the last page or all programs are ineligible
    const allProgramsEvaluated = programs.every(program => hasRequiredAnswers(program.id));
    const noEligiblePrograms = updatedEligiblePrograms.size === 0 && allProgramsEvaluated;

    if (noEligiblePrograms || (updatedEligiblePrograms.size > 0 && surveyModel.isLastPage)) {
      displayResults(updatedEligiblePrograms, noEligiblePrograms);
    }

    console.log("Eligible programs after evaluation:", updatedEligiblePrograms);
  }, [programs, evaluateCriteriaGroup, surveyModel, hasRequiredAnswers]);

  // New helper function to display results
  const displayResults = useCallback((eligiblePrograms, noEligiblePrograms) => {
    // Hide all existing questions
    surveyModel.getAllQuestions().forEach((q) => (q.visible = false));

    if (noEligiblePrograms) {
      const noEligibilityPage = surveyModel.addNewPage("NoEligibilityPage");
      noEligibilityPage.addNewQuestion("html", "noEligibilityMessage").html = `
        <h3>Unfortunately, you are not eligible for any programs.</h3>
        <p>Based on your responses, we couldn't determine eligibility for any programs at this time.</p>
      `;
      surveyModel.currentPage = noEligibilityPage;
    } else {
      const eligibleProgramsPage = surveyModel.addNewPage("EligibleProgramsPage");
      eligibleProgramsPage.addNewQuestion("html", "eligibleProgramsMessage").html = `
        <div style="text-align: center; padding: 30px;">
          <h3 style="font-size: 2rem; color: #2c3e50;">Congratulations! You are eligible for the following programs:</h3>
          <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; display: inline-block; margin-top: 20px; max-width: 600px; box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.1);">
            <ul style="list-style: none; padding: 0; margin: 0; text-align: left; font-size: 1.2rem;">
              ${Array.from(eligiblePrograms)
                .map(
                  (programId) => {
                    const program = programs.find((p) => p.id === programId);
                    return `
                      <li style="margin: 20px 0; display: flex; align-items: center; gap: 10px;">
                        <!-- Checkbox -->
                        <span style="color: #2ecc71; font-size: 1.5rem; margin-right: 10px;">✔</span>
                        
                        <!-- Program Details -->
                        <div style="flex: 1; display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                          <!-- Program Name -->
                          <div style="font-weight: bold; font-size: 1.5rem; color: #34495e; max-width: 60%;">
                            ${program?.name || "Unknown Program"}
                          </div>
                          
                          <!-- Savings & Link -->
                          <div style="text-align: right; color: #7f8c8d; font-size: 1rem; max-width: 40%;">
                            <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 5px;">
                              ${program?.estimated_savings || "Savings info not available"}
                            </div>
                            ${program?.application_link ? `<a href="${program.application_link}" target="_blank" rel="noopener noreferrer" style="color: #3498db; text-decoration: none; font-size: 1rem;">Apply Now</a>` : ""}
                          </div>
                        </div>
                      </li>
                    `;
                  }
                )
                .join("")}
            </ul>
          </div>
        </div>
      `;
      surveyModel.currentPage = eligibleProgramsPage;
    }

    surveyModel.showNavigationButtons = false;
  }, [surveyModel, programs]);

  const initializeSurveyModel = useCallback(() => {
    console.log("Initializing survey model...");

    const programNamesHtml = programs
      .map((program) => `<li>${program.name}</li>`)
      .join("");
  
    const surveyQuestions = questions.map((question) => {
      let choices = [];
  
      // Handle dropdown options specifically
      if (question.input_type === "dropdown") {
        choices = question.options || []; // Ensure options are passed correctly
        console.log(`Dropdown options for "${question.question}":`, choices);
      } else if (question.input_type === "radio") {
        choices = question.options ? question.options : ["Yes", "No"]; // Default for radio
      }
  
      console.log(`Adding question: ${question.question} with choices: ${choices}`);
      return {
        name: question.question,
        title: question.question,
        type: question.type === "boolean" ? "radiogroup" : question.type === "number" ? "text" : "dropdown",
        isRequired: true,
        choices: choices, // Ensure the choices are passed for dropdown
        inputType: question.type === "number" ? "number" : undefined,
      };
    });
  
    const survey = new SurveyCore.Model({
      pages: [
        {
          name: "welcome",
          elements: [
            {
              type: "html",
              name: "welcomeText",
              html: `
                <h2>Welcome to the Eligibility Screener!</h2>
                <p>We will guide you through a series of questions to determine your eligibility the following programs:</p>
                <ul>${programNamesHtml}</ul>
                <p>Click <strong>Start</strong> to begin.</p>
                <p>Please note that none of your data will be collected!</p>
              `,
            },
          ],
        },
        {
          name: "questions",
          elements: surveyQuestions,
        },
      ],
      firstPageIsStarted: true,
      startSurveyText: "Start",
      showProgressBar: "top",
      questionsOnPageMode: "single",
      showQuestionNumbers: "off",
    });
  
    survey.completedHtml = "<h3>Survey Complete</h3><p>Your eligible programs will be displayed here.</p>";
  
    survey.onValueChanged.add((sender, options) => {
      if (surveyCompleted) {
        console.log("Survey already completed. Ignoring value change.");
        return;
      }
  
      const { name, value } = options;
      userResponses.current[name] = value;
      console.log("User responses updated:", userResponses.current);
      evaluateEligibility();
    });
  
    survey.onComplete.add(() => {
      console.log("Survey complete. Final user responses:", { ...userResponses.current });
      setSurveyCompleted(true); // Mark survey as complete
    });
  
    return survey;
  }, [questions, evaluateEligibility, surveyCompleted]);
  

  useEffect(() => {
    if (!surveyModel) {
      console.log("Setting survey model...");
      const survey = initializeSurveyModel();
      setSurveyModel(survey);
    }
  }, [initializeSurveyModel, surveyModel]);

  useEffect(() => {
    if (surveyModel && evaluationPending) {
      console.log("Deferred evaluation running...");
      setEvaluationPending(false); // Clear pending state
      evaluateEligibility();
    }
  }, [surveyModel, evaluationPending, evaluateEligibility]);

  return (
    <div>
      {surveyCompleted ? (
        <div className="completion-container">
          <h3 className="completion-title">Eligibility Survey Complete</h3>
          {eligiblePrograms.size > 0 ? (
            <>
              <p className="completion-message">Congratulations! You are eligible for the following programs:</p>
              <ul className="completion-list">
                {Array.from(eligiblePrograms).map((programId) => {
                  const program = programs.find((p) => p.id === programId);
                  return <li key={programId}>{program?.name || "Unknown Program"}</li>;
                })}
              </ul>
            </>
          ) : (
            <p className="completion-message">Unfortunately, you are not eligible for any programs at this time.</p>
          )}
        </div>
      ) : (
        surveyModel ? <Survey model={surveyModel} /> : <p>Loading...</p>
      )}
    </div>
  );
};

export default EligibilityScreener;
