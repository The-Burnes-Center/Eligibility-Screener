import React, { useState, useEffect, useCallback, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

const EligibilityScreener = () => {
  const { programs = [], criteria = [], questions = [] } = surveyData || {};

  const [surveyModel, setSurveyModel] = useState(null);
  const [eligiblePrograms, setEligiblePrograms] = useState(
    new Set(programs.map((p) => p.id))
  );
  const [surveyCompleted, setSurveyCompleted] = useState(false); // Track if the survey has ended
  const userResponses = useRef({});

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
    if (surveyCompleted) return; // Stop evaluating if the survey has ended

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
          programEligibilityMap[program.id] = false;
        }
      }
    });

    const updatedEligiblePrograms = new Set(
      Object.keys(programEligibilityMap).filter((programId) => programEligibilityMap[programId])
    );
    console.log("Updated eligible programs:", updatedEligiblePrograms);

    if (updatedEligiblePrograms.size === 0) {
      console.log("No eligible programs remaining. Ending survey.");
      console.log("Survey model:", surveyModel);
      if (surveyModel) {
        surveyModel.completedHtml = "<h3>Survey Complete</h3><p>You are not eligible for any programs.</p>";

        // Set all questions' visibility to false
        const surveyQuestions = surveyModel.getAllQuestions();
        surveyQuestions.forEach((q) => (q.visible = false));
        console.log("Survey questions hidden:", surveyQuestions);

        surveyModel.doComplete(); // Transition survey to "complete" state
        setSurveyCompleted(true); // Prevent further updates
      }
      return;
    }
    console.log('outside survey', surveyModel);

    if (
      updatedEligiblePrograms.size !== eligiblePrograms.size ||
      [...updatedEligiblePrograms].some((p) => !eligiblePrograms.has(p))
    ) {
      setEligiblePrograms(updatedEligiblePrograms);

      // Dynamically update question visibility
      if (surveyModel) {
        const surveyQuestions = surveyModel.getAllQuestions();
        surveyQuestions.forEach((question) => {
          const relevantPrograms = question.criteria_impact?.map((ci) => ci.program_id) || [];
          question.visible = relevantPrograms.some((programId) => updatedEligiblePrograms.has(programId));
        });
      }
    }

    console.log("Eligible programs:", updatedEligiblePrograms);
  }, [programs, criteria, questions, eligiblePrograms, meetsCriterion, surveyModel, surveyCompleted]);

  const initializeSurveyModel = useCallback(() => {
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

    survey.completedHtml = "<h3>Survey Complete</h3><p>Your eligible programs will be displayed here.</p>";
    return survey;
  }, [questions]);

  useEffect(() => {
    if (!surveyModel) {
      const survey = initializeSurveyModel();

      survey.onValueChanged.add((sender, options) => {
        if (surveyCompleted) return; // Skip evaluation if the survey is complete

        const { name, value } = options;
        userResponses.current[name] = value;
        evaluateEligibility();
      });

      survey.onComplete.add(() => {
        console.log("Survey complete. Final user responses:", { ...userResponses.current });
      });

      setSurveyModel(survey);
    }
  }, [initializeSurveyModel, evaluateEligibility, surveyModel, surveyCompleted]);

  return (
    <div>
      <h1>Eligibility Screener</h1>
      {surveyModel ? <Survey model={surveyModel} /> : <p>Loading...</p>}
    </div>
  );
};

export default EligibilityScreener;
