import React, { useState, useEffect, useCallback, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

// Debounce helper to limit eligibility evaluation frequency
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
    const programEligibilityMap = {};

    programs.forEach((program) => {
      // Start with the assumption that the program is eligible
      programEligibilityMap[program.id] = true;

      for (const criteria_id of program.criteria_ids) {
        if (!programEligibilityMap[program.id]) break; // Short-circuit if already ineligible

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

        console.log(
          `Evaluating Program: ${program.id}, Criterion: ${criteria_id}, Answer: ${userAnswer}, Pass: ${isPass}`
        );

        if (!isPass) {
          programEligibilityMap[program.id] = false;
          console.log(`Program "${program.id}" marked as ineligible due to failing criterion "${criteria_id}".`);
        }
      }
    });

    const updatedEligiblePrograms = new Set(
      Object.keys(programEligibilityMap).filter((programId) => programEligibilityMap[programId])
    );

    setEligiblePrograms(updatedEligiblePrograms);
    console.log("Eligible Programs Updated:", updatedEligiblePrograms);
  }, [programs, criteria, questions, meetsCriterion]);

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

    return survey;
  }, [questions]);

  useEffect(() => {
    const survey = initializeSurveyModel();
    const debouncedEvaluateEligibility = debounce(evaluateEligibility, 300);

    survey.onValueChanged.add((sender, options) => {
      const { name, value } = options;
      userResponses.current[name] = value;
      console.log("Current user responses:", { ...userResponses.current });

      debouncedEvaluateEligibility();
    });

    survey.onComplete.add(() => {
      console.log("Survey complete. Final user responses:", { ...userResponses.current });
    });

    setSurveyModel(survey);
  }, [initializeSurveyModel, evaluateEligibility]);

  return (
    <div>
      <h1>Eligibility Screener</h1>
      {surveyModel ? (
        <Survey model={surveyModel} />
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default EligibilityScreener;
