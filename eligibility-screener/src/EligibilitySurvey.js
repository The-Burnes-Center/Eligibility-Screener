import React, { useState, useEffect, useCallback, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

const EligibilityScreener = () => {
  const { programs = [], criteria = [], questions = [] } = surveyData || {};
  console.log(surveyData); // Confirm the structure

  const [surveyModel, setSurveyModel] = useState(null);
  const [eligiblePrograms, setEligiblePrograms] = useState(
    new Set(programs.map((p) => p.id))
  );
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

    if (
      updatedEligiblePrograms.size !== eligiblePrograms.size ||
      [...updatedEligiblePrograms].some((p) => !eligiblePrograms.has(p))
    ) {
      setEligiblePrograms(updatedEligiblePrograms);
    }
    console.log("Eligible programs:", updatedEligiblePrograms);
  }, [programs, criteria, questions, eligiblePrograms, meetsCriterion]);

  const initializeSurveyModel = useCallback(() => {
    const surveyQuestions = questions
      .filter((question) =>
        question.criteria_impact.some((impact) => eligiblePrograms.has(impact.program_id))
      )
      .map((question) => ({
        name: question.question,
        title: question.question,
        type: question.type === "boolean" ? "radiogroup" : question.type === "number" ? "text" : "dropdown",
        isRequired: true,
        choices: question.input_type === "radio" ? ["Yes", "No"] : question.choices || undefined,
        inputType: question.type === "number" ? "number" : undefined,
      }));
    console.log(surveyQuestions); // Confirm the structure

    const survey = new SurveyCore.Model({
      questions: surveyQuestions,
      questionsOnPageMode: "single",
      showQuestionNumbers: "off",
    });

    return survey;
  }, [questions, eligiblePrograms]);

  // Initialize survey model once
  useEffect(() => {
    const survey = initializeSurveyModel();

    survey.onValueChanged.add((sender, options) => {
      const { name, value } = options;
      userResponses.current[name] = value;
      evaluateEligibility(); // Only evaluate eligibility here
    });

    survey.onComplete.add(() => {
      console.log("Survey complete. Final user responses:", { ...userResponses.current });
    });

    setSurveyModel(survey);
  }, [initializeSurveyModel, evaluateEligibility]);

  // Update survey model dynamically when eligible programs change
  useEffect(() => {
    if (surveyModel) {
      const updatedSurvey = initializeSurveyModel();
      setSurveyModel(updatedSurvey);
    }
  }, [eligiblePrograms, initializeSurveyModel]);

  return (
    <div>
      <h1>Eligibility Screener</h1>
      {surveyModel ? <Survey model={surveyModel} /> : <p>Loading...</p>}
    </div>
  );
};

export default EligibilityScreener;
