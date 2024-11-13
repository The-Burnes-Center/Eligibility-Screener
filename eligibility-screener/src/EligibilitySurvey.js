import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

const EligibilityScreener = () => {
  const { programs, criteria, questions } = surveyData;

  const [surveyModel, setSurveyModel] = useState(null);
  const [eligiblePrograms, setEligiblePrograms] = useState(new Set(programs.map(p => p.id)));
  const userResponses = useRef({}); // Track answers without re-rendering on updates

  // Helper function to check if a criterion is met
  const meetsCriterion = useCallback((criterion, answer) => {
    if (!criterion) return true;

    const thresholdKey = Object.keys(criterion).find(key => key.startsWith("threshold_by_"));
    if (thresholdKey) {
      const variableName = thresholdKey.replace("threshold_by_", "");
      const variableValue = userResponses.current[variableName];

      if (variableValue !== undefined && criterion[thresholdKey][variableValue] !== undefined) {
        const threshold = criterion[thresholdKey][variableValue];
        return criterion.comparison === "<=" ? answer <= threshold : answer >= threshold;
      } else {
        return false;
      }
    } else {
      if (criterion.threshold !== undefined) {
        return criterion.comparison === "<=" ? answer <= criterion.threshold : answer >= criterion.threshold;
      } else if (criterion.options) {
        return criterion.options.includes(answer);
      }
    }
    return true;
  }, []);

  // Sort questions by program impact
  const sortedQuestions = useMemo(() => {
    return questions
      .map(question => {
        // Ensure criteria_impact exists and is not empty
        const programImpact = Array.isArray(question.criteria_impact) && question.criteria_impact.length > 0
          ? new Set(question.criteria_impact.map(ci => ci.program_id)).size
          : 0;
        
        const criteriaImpactCount = Array.isArray(question.criteria_impact) ? question.criteria_impact.length : 0;

        // Log for debugging: Check criteria_impact length
        console.log(`Question: ${question.question}, Criteria Impact Count:`, criteriaImpactCount);

        return { ...question, programImpact, criteriaImpactCount };
      })
      .sort((a, b) => {
        if (b.programImpact !== a.programImpact) return b.programImpact - a.programImpact;
        return b.criteriaImpactCount - a.criteriaImpactCount;
      });
  }, [questions]);

  // Define survey questions
  const surveyQuestions = useMemo(() => {
    return sortedQuestions.map(question => {
      // Ensure that criteria_impact is defined and has at least one entry
      const programImpact = Array.isArray(question.criteria_impact) && question.criteria_impact.length > 0
        ? new Set(question.criteria_impact.map(ci => ci.program_id)).size
        : 0;

      const criteriaImpactCount = Array.isArray(question.criteria_impact) ? question.criteria_impact.length : 0;

      // Log for debugging: Check if criteria_impact exists and has items
      console.log(`Question: ${question.question}, Criteria Impact Array:`, question.criteria_impact);

      return {
        name: question.question,
        title: question.question,
        type: question.type === "boolean" ? "radiogroup" : question.type,
        isRequired: true,
        choices: question.input_type === "radio" ? ["Yes", "No"] : undefined,
        inputType: question.input_type === "text" && question.type === "number" ? "number" : undefined,
      };
    });
  }, [sortedQuestions]);

  useEffect(() => {
    const survey = new SurveyCore.Model({
      questions: surveyQuestions,
      questionsOnPageMode: "single", // Show one question at a time
      showQuestionNumbers: "off", // Hide question numbers in single-question mode
    });

    survey.onValueChanged.add((sender, options) => {
      const { name, value } = options;
      userResponses.current[name] = value; // Track answers in `userResponses`

      // Update eligibility based on the current answers
      const updatedEligiblePrograms = new Set(programs.map(p => p.id)); // Reset eligibility

      programs.forEach(program => {
        for (const criteria_id of program.criteria_ids) {
          const criterion = criteria.find(c => c.id === criteria_id);
          if (!criterion) continue;

          const questionForCriterion = questions.find(q =>
            (q.criteria_impact || []).some(ci => ci.criteria_id === criteria_id)
          );
          if (!questionForCriterion) continue;

          const userAnswer = userResponses.current[questionForCriterion.question];
          if (userAnswer !== undefined && !meetsCriterion(criterion, userAnswer)) {
            updatedEligiblePrograms.delete(program.id);
            break;
          }
        }
      });

      // Update eligible programs
      console.log("Updated eligible programs:", Array.from(updatedEligiblePrograms));
      setEligiblePrograms(updatedEligiblePrograms);

      // After each answer, show the next question based on eligibility, but keep asking all questions
      const nextQuestionIndex = surveyQuestions.findIndex(q => q.name === name) + 1;

      // Ensure nextQuestionIndex is within valid bounds
      if (nextQuestionIndex < surveyQuestions.length) {
        const nextQuestion = surveyQuestions[nextQuestionIndex];

        // Check if the next question is valid and eligible
        if (nextQuestion) {
          // Only show the next question if it's part of the current eligible programs
          const nextQuestionEligible = eligiblePrograms.has(nextQuestion.criteria_impact?.[0]?.program_id);
          if (nextQuestionEligible) {
            survey.showQuestion(survey.questions[nextQuestionIndex]);
          }
        }
      } else {
        // Handle the case where no more questions are left
        console.log('No more questions to show');
      }
    });

    setSurveyModel(survey);
  }, [programs, criteria, questions, surveyQuestions, meetsCriterion]);

  return (
    <div>
      <h1>Eligibility Screener</h1>
      {surveyModel ? <Survey model={surveyModel} /> : <p>Loading...</p>}
    </div>
  );
};

export default EligibilityScreener;
