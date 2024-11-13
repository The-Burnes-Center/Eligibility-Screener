import React, { useState, useEffect, useCallback, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json"; // Ensure this is your correct data path
import "survey-core/defaultV2.min.css";

// Debounce helper to limit how often eligibility evaluation occurs
const debounce = (func, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

const EligibilityScreener = () => {
  const { programs, criteria, questions } = surveyData;

  const [surveyModel, setSurveyModel] = useState(null);
  const [eligiblePrograms, setEligiblePrograms] = useState(new Set(programs.map((p) => p.id)));
  const userResponses = useRef({});

  /**
   * Helper function to check if a criterion is met.
   */
  const meetsCriterion = useCallback((criterion, answer, householdSize) => {
    if (!criterion) return true;

    const thresholdKey = Object.keys(criterion).find((key) =>
      key.startsWith("threshold_by_")
    );

    // Handle threshold-based criteria that depend on household size
    if (thresholdKey) {
      if (householdSize !== undefined && criterion[thresholdKey][householdSize] !== undefined) {
        const threshold = criterion[thresholdKey][householdSize];
        const comparison = criterion.comparison;
        const result = comparison === "<=" ? answer <= threshold : answer >= threshold;
        console.log(`Household Size: ${householdSize}, Threshold: ${threshold}, Result: ${result}`);
        return result;
      }
      return false; // Fail if household size or threshold is missing
    }

    // Handle direct threshold criteria
    if (criterion.threshold !== undefined) {
      const comparison = criterion.comparison;
      const result = comparison === "<=" ? answer <= criterion.threshold : answer >= criterion.threshold;
      console.log(`Threshold: ${criterion.threshold}, Result: ${result}`);
      return result;
    }

    // Handle options-based criteria (e.g., Yes/No)
    if (criterion.options) {
      return criterion.options.includes(answer);
    }

    return true; // Default to true if no criterion type matches
  }, []);

  /**
   * Function to evaluate eligibility based on user responses.
   * Updates eligiblePrograms based on user responses.
   */
  const evaluateEligibility = useCallback(() => {
    const programEligibilityMap = {};

    // Assume all programs are eligible at the start of evaluation
    programs.forEach((program) => {
      programEligibilityMap[program.id] = true;
    });

    programs.forEach((program) => {
      program.criteria_ids.forEach((criteria_id) => {
        const criterion = criteria.find((c) => c.id === criteria_id);

        // Ensure the criterion is found in the criteria array
        if (!criterion) {
          console.warn(`Criterion ID "${criteria_id}" not found for program "${program.id}". Skipping.`);
          return;
        }

        // Find the question associated with this criterion
        const question = questions.find((q) =>
          q.criteria_impact.some((ci) => ci.criteria_id === criteria_id)
        );

        if (!question) {
          console.warn(`No question found for criterion "${criteria_id}" in program "${program.id}". Skipping.`);
          return;
        }

        // Ensure user has answered the required question
        const questionName = question.question;
        const userAnswer = userResponses.current[questionName];
        const householdSize = userResponses.current["What is your household size?"];

        if (userAnswer === undefined) {
          // Skip eligibility evaluation for criteria that haven't been answered yet
          console.log(`Awaiting answer for criterion "${criteria_id}" in program "${program.id}".`);
          return;
        }

        const isPass = meetsCriterion(criterion, userAnswer, householdSize);

        console.log(`Evaluating: Program: ${program.id}, Criterion: ${criteria_id}, Answer: ${userAnswer}, Pass: ${isPass}`);

        // If the criterion fails, mark the program as ineligible
        if (!isPass) {
          programEligibilityMap[program.id] = false;
          console.log(`Program "${program.id}" marked as ineligible due to failing criterion "${criteria_id}".`);
        }
      });
    });

    const updatedEligiblePrograms = new Set(
      Object.keys(programEligibilityMap).filter((programId) => programEligibilityMap[programId])
    );

    setEligiblePrograms(updatedEligiblePrograms);
    console.log("Eligible Programs Updated:", updatedEligiblePrograms);
  }, [programs, criteria, questions, meetsCriterion]);

  /**
   * Initializes the SurveyJS model with questions.
   */
  const initializeSurveyModel = useCallback(() => {
    const surveyQuestions = questions.map((question) => {
      let questionType = "text"; // Default type

      if (question.type === "boolean") {
        questionType = "radiogroup";
      } else if (question.type === "number") {
        questionType = "text";
      } else if (question.type === "dropdown") {
        questionType = "dropdown";
      }

      return {
        name: question.question, // Using question text as the unique identifier
        title: question.question,
        type: questionType,
        isRequired: true,
        choices: question.input_type === "radio" ? ["Yes", "No"] : question.choices || undefined,
        inputType: question.type === "number" ? "number" : undefined,
      };
    });

    const survey = new SurveyCore.Model({
      questions: surveyQuestions,
      questionsOnPageMode: "single",
      showQuestionNumbers: "off",
    });

    return survey;
  }, [questions]);

  /**
   * Effect to initialize the survey and set up eligibility evaluation.
   */
  useEffect(() => {
    const survey = initializeSurveyModel();

    const debouncedEvaluateEligibility = debounce(evaluateEligibility, 300);

    survey.onValueChanged.add((sender, options) => {
      const { name, value } = options;

      // Save the answer
      userResponses.current[name] = value;
      console.log("Current user responses:", { ...userResponses.current });

      // Only evaluate eligibility after a short delay to ensure all criteria are accounted for
      debouncedEvaluateEligibility();
    });

    survey.onComplete.add(() => {
      console.log("Survey complete. Final user responses:", { ...userResponses.current });
    });

    setSurveyModel(survey);
  }, [initializeSurveyModel, evaluateEligibility]);

  return (
    <div>
      <h1>Eligibility Screener new</h1>
      {surveyModel ? (
        <Survey model={surveyModel} />
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default EligibilityScreener;
