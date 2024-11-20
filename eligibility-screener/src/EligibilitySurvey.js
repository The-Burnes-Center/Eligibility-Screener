import React, { useState, useEffect, useCallback, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

const EligibilityScreener = () => {
  const { programs = [], criteria = [], questions = [] } = surveyData || {};
  console.log("Programs:", programs);
  console.log("Criteria:", criteria);
  console.log("Questions:", questions);

  const userResponses = useRef({});
  const [eligiblePrograms, setEligiblePrograms] = useState(
    new Set(programs.map((p) => p.id))
  );
  const [surveyCompleted, setSurveyCompleted] = useState(false);
  const [surveyModel, setSurveyModel] = useState(null);

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
      console.warn("Survey model not initialized. Skipping evaluation.");
      return;
    }

    const programEligibilityMap = {};

    programs.forEach((program) => {
      programEligibilityMap[program.id] = true;

      (program.criteria_ids || []).forEach((criteria_id) => {
        if (!programEligibilityMap[program.id]) return;

        const criterion = criteria.find((c) => c.id === criteria_id);
        const question = questions.find((q) =>
          q.criteria_impact.some((ci) => ci.criteria_id === criteria_id)
        );

        if (!criterion || !question) {
          console.warn(
            `Missing criterion "${criteria_id}" or question for program "${program.id}".`
          );
          return;
        }

        const questionName = question.question;
        const userAnswer = userResponses.current[questionName];
        const householdSize = userResponses.current["What is your household size?"];

        if (userAnswer === undefined) return;

        const isPass = meetsCriterion(criterion, userAnswer, householdSize);

        if (!isPass) {
          console.log(
            `Criterion "${criteria_id}" failed for program "${program.id}". Reason: ${criterion.description}`
          );
          programEligibilityMap[program.id] = false;
        }
      });
    });

    const updatedEligiblePrograms = new Set(
      Object.keys(programEligibilityMap).filter((programId) => programEligibilityMap[programId])
    );
    setEligiblePrograms(updatedEligiblePrograms);

    if (updatedEligiblePrograms.size === 0) {
      surveyModel.completedHtml = `
        <h3>Unfortunately, you are not eligible for any programs.</h3>
        <p>You may want to revisit your answers or check other eligibility criteria.</p>
      `;
    } else {
      surveyModel.completedHtml = `
        <h3>Congratulations! You are still eligible for:</h3>
        <ul>
          ${Array.from(updatedEligiblePrograms)
            .map((programId) => {
              const program = programs.find((p) => p.id === programId);
              return `<li>${program?.name || "Unknown Program"}</li>`;
            })
            .join("")}
        </ul>
      `;
    }
  }, [surveyModel, programs, criteria, questions, meetsCriterion]);

  const initializeSurveyModel = useCallback(() => {
    console.trace("initializeSurveyModel called");
    console.log("Initializing survey model...");

    if (!questions || questions.length === 0) {
      console.warn("No questions found to initialize survey.");
      return null;
    }

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
      progressBarType: "questions",
    });

    survey.showProgressBar = "top";

    survey.onValueChanged.add((sender, options) => {
      const { name, value } = options;
      userResponses.current[name] = value;

      evaluateEligibility();
    });

    survey.onComplete.add(() => {
      setSurveyCompleted(true);
    });

    return survey;
  }, [questions, evaluateEligibility]);

  const surveyModelRef = useRef(null);

  useEffect(() => {
    if (!surveyModelRef.current) {
      const survey = initializeSurveyModel();
      surveyModelRef.current = survey;
      setSurveyModel(survey);
    }
  }, [initializeSurveyModel]);

  return (
    <div>
      <h1>Eligibility Screener</h1>
      {surveyCompleted ? (
        <div>
          <h3>Survey Complete</h3>
          {eligiblePrograms.size > 0 ? (
            <ul>
              {Array.from(eligiblePrograms).map((programId) => {
                const program = programs.find((p) => p.id === programId);
                return <li key={programId}>{program?.name || "Unknown Program"}</li>;
              })}
            </ul>
          ) : (
            <p>Unfortunately, you are not eligible for any programs.</p>
          )}
        </div>
      ) : (
        surveyModel ? <Survey model={surveyModel} /> : <p>Loading...</p>
      )}
    </div>
  );
};

export default EligibilityScreener;
