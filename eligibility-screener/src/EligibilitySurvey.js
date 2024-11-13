import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import * as SurveyCore from "survey-core";
import { Survey } from "survey-react-ui";
import surveyData from "./config/eligibility_config.json";
import "survey-core/defaultV2.min.css";

const EligibilityScreener = () => {
  const { programs, criteria, questions } = surveyData;

  const [surveyModel, setSurveyModel] = useState(null);
  const [eligiblePrograms, setEligiblePrograms] = useState(new Set(programs.map(p => p.id)));
  const userResponses = useRef({});

  // Helper function to check if a criterion is met
  const meetsCriterion = useCallback((criterion, answer) => {
    if (!criterion) return true;

    const thresholdKey = Object.keys(criterion).find(key => key.startsWith("threshold_by_"));
    if (thresholdKey) {
      const variableName = thresholdKey.replace("threshold_by_", "");
      const variableValue = userResponses.current[variableName];

      if (variableValue !== undefined && criterion[thresholdKey][variableValue] !== undefined) {
        const threshold = criterion[thresholdKey][variableValue];
        console.log(`Threshold for "${variableName}" = ${variableValue}: ${threshold}`);
        return criterion.comparison === "<=" ? answer <= threshold : answer >= threshold;
      } else {
        return false;
      }
    } else {
      if (criterion.threshold !== undefined) {
        console.log(`Threshold: ${criterion.threshold}`);
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
        const programImpact = Array.isArray(question.criteria_impact) && question.criteria_impact.length > 0
          ? new Set(question.criteria_impact.map(ci => ci.program_id)).size
          : 0;
        
        const criteriaImpactCount = Array.isArray(question.criteria_impact) ? question.criteria_impact.length : 0;
        return { ...question, programImpact, criteriaImpactCount };
      })
      .sort((a, b) => {
        if (b.programImpact !== a.programImpact) return b.programImpact - a.programImpact;
        return b.criteriaImpactCount - a.criteriaImpactCount;
      });
  }, [questions]);

  // Define survey questions and control visibility based on eligibility
  const surveyQuestions = useMemo(() => {
    return sortedQuestions.map(question => {
      let questionType = "text"; // Default type

      // Determine the correct question type based on the question data
      if (question.type === "boolean") {
        questionType = "radiogroup";  // For boolean, use radio buttons
      } else if (question.type === "number") {
        questionType = "text"; // For number, use text input with number validation
      } else if (question.type === "dropdown") {
        questionType = "dropdown"; // For dropdowns, use the dropdown input
      } else if (question.type === "checkbox") {
        questionType = "checkbox"; // For checkboxes, use checkbox input
      }

      // Check if this question should be visible based on program eligibility
      const isVisible = () => {
        // Implement logic to determine whether the question should be visible
        // Hide question if its related program is not eligible
        return eligiblePrograms.has(question.criteria_impact?.[0]?.program_id);
      };

      return {
        name: question.question,
        title: question.question,
        type: questionType,
        isRequired: true,
        choices: question.input_type === "radio" ? ["Yes", "No"] : question.choices || undefined,
        inputType: question.type === "number" ? "number" : undefined,
        visible: isVisible(), // Conditionally set visibility based on eligibility
      };
    });
  }, [sortedQuestions, eligiblePrograms]); // Recalculate when eligiblePrograms change
  console.log('Survey questions:', surveyQuestions);

  useEffect(() => {
    const survey = new SurveyCore.Model({
      questions: surveyQuestions,
      questionsOnPageMode: "single", // Show one question at a time
      showQuestionNumbers: "off", // Hide question numbers in single-question mode
    });

    // Log the questions in the survey model for debugging
    console.log('Survey model questions:', survey.getAllQuestions());

    survey.onValueChanged.add((sender, options) => {
      const { name, value } = options;
      userResponses.current[name] = value; // Track the user's answer
    
      const updatedEligiblePrograms = new Set(programs.map(p => p.id)); // Start with all programs being eligible
    
      // Loop through each program to check eligibility based on criteria
      programs.forEach(program => {
        let isEligibleForProgram = true; // Assume the program is eligible at first
    
        for (const criteria_id of program.criteria_ids) {
          const criterion = criteria.find(c => c.id === criteria_id);
          if (!criterion) continue;
    
          const questionForCriterion = questions.find(q =>
            (q.criteria_impact || []).some(ci => ci.criteria_id === criteria_id)
          );
          if (!questionForCriterion) continue;
    
          const userAnswer = userResponses.current[questionForCriterion.question];
    
          // Log the criteria being evaluated
          console.log(`Evaluating criteria for program "${program.id}"`);
          console.log(`Question: "${questionForCriterion.question}"`);
          console.log(`User Answer: "${userAnswer}"`);
    
          // Log the criterion being checked
          console.log('Criterion:', criterion);
    
          // Check if the user's answer meets the criterion
          const isPass = meetsCriterion(criterion, userAnswer);
          
          // Log the evaluation result
          if (isPass) {
            console.log(`Answer passes the criteria.`);
          } else {
            console.log(`Answer does not pass the criteria. Program "${program.id}" becomes ineligible.`);
            isEligibleForProgram = false;
            break; // No need to check further criteria for this program
          }
        }
    
        // If the program is not eligible, remove it from the eligible list
        if (!isEligibleForProgram) {
          updatedEligiblePrograms.delete(program.id);
        }
      });
    
      // Update the eligible programs
      setEligiblePrograms(updatedEligiblePrograms);
      console.log('Updated eligible programs:', updatedEligiblePrograms);
    });
    

    // Set the survey model
    setSurveyModel(survey);
  }, [programs, criteria, questions, surveyQuestions, meetsCriterion]);

  return (
    <div>
      <h1>Eligibility Screener</h1>
      {surveyModel ? (
        <Survey model={surveyModel} />
      ) : (
        <p>Loading...</p>
      )}
      {/* Log when the Survey component is rendered */}
      {surveyModel && (
        <pre>
          {JSON.stringify(surveyModel, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default EligibilityScreener;
