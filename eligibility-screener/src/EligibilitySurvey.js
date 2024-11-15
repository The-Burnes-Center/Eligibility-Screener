import React, { useState, useEffect, useCallback, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

const EligibilityScreener = () => {
  const { programs = [], criteria = [], questions = [] } = surveyData || {};

  const userResponses = useRef({});
  const [eligiblePrograms, setEligiblePrograms] = useState(
    new Set(programs.map((p) => p.id))
  );
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const [surveyModel, setSurveyModel] = useState(null);
  const [evaluationPending, setEvaluationPending] = useState(false); // Tracks pending evaluations

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

  const evaluateEligibility = useCallback(() => {
    if (!surveyModel) {
      console.warn("Survey model not initialized. Deferring evaluation.");
      setEvaluationPending(true);
      return;
    }
  
    const programEligibilityMap = {};
  
    programs.forEach((program) => {
      programEligibilityMap[program.id] = true;
  
      for (const criteria_id of program.criteria_ids) {
        if (!programEligibilityMap[program.id]) break;
  
        const criterion = criteria.find((c) => c.id === criteria_id);
        const question = questions.find((q) =>
          q.criteria_impact.some((ci) => ci.criteria_id === criteria_id)
        );
  
        if (!question) {
          console.warn(`No question found for criterion "${criteria_id}" in program "${program.id}". Skipping.`);
          continue;
        }
  
        const questionName = question.question;
        const userAnswer = userResponses.current[questionName];
        const householdSize = userResponses.current["What is your household size?"];
  
        if (userAnswer === undefined) {
          console.log(`Awaiting answer for criterion "${criteria_id}" in program "${program.id}".`);
          continue;
        }
  
        const isPass = meetsCriterion(criterion, userAnswer, householdSize);
  
        if (!isPass) {
          console.log(`Criterion "${criteria_id}" failed for program "${program.id}". Marking ineligible.`);
          programEligibilityMap[program.id] = false;
        }
      }
    });
  
    // Set the eligible programs before checking for completion
    const updatedEligiblePrograms = new Set(
      Object.keys(programEligibilityMap).filter((programId) => programEligibilityMap[programId])
    );
    setEligiblePrograms(updatedEligiblePrograms); // Update the state here
  
    console.log("Updated eligible programs:", updatedEligiblePrograms);
  
    // If no programs are eligible, end the survey
    if (updatedEligiblePrograms.size === 0) {
      console.log("No eligible programs remaining. Ending survey.");
      if (surveyModel) {
        surveyModel.completedHtml = "<h3>Survey Complete</h3><p>Unfortunately, you are not eligible for any programs.</p>";
  
        // Hide all questions
        const surveyQuestions = surveyModel.getAllQuestions();
        surveyQuestions.forEach((q) => (q.visible = false));
        console.log("Survey questions hidden:", surveyQuestions);
  
        surveyModel.doComplete(); // End the survey
        setSurveyCompleted(true);
      }
      return;
    }
  
    console.log("Eligible programs after evaluation:", updatedEligiblePrograms);
  }, [programs, criteria, questions, meetsCriterion, surveyModel]);
  

  const initializeSurveyModel = useCallback(() => {
    console.log("Initializing survey model...");
    const surveyQuestions = questions.map((question) => ({
      name: question.question,
      title: question.question,
      type: question.type === "boolean" ? "radiogroup" : question.type === "number" ? "text" : "dropdown",
      isRequired: true,
      choices: question.input_type === "radio" ? ["Yes", "No"] : question.choices || undefined,
      inputType: question.type === "number" ? "number" : undefined,
    }));

    const survey = new SurveyCore.Model({
      questions: surveyQuestions,
      questionsOnPageMode: "single",
      showQuestionNumbers: "off",
    });

    console.log('eliglbe', eligiblePrograms);
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
      <h1>Eligibility Screener</h1>
      {surveyCompleted ? (
        <div className="completion-container">
          <h3 className="completion-title">Survey Complete</h3>
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
