import React, { useState, useEffect } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import "survey-core/defaultV2.min.css";
import eligibilityConfig from './config/eligibility_config.json';

function EligibilityScreen() {
  const [survey, setSurvey] = useState(null);
  const [results, setResults] = useState(null);
  const [eligibilityStatus, setEligibilityStatus] = useState(
    Object.fromEntries(Object.keys(eligibilityConfig.programs).map(program => [program, true]))
  );

  useEffect(() => {
    const newSurvey = new Model({
      title: eligibilityConfig.title,
      pages: [{ elements: eligibilityConfig.questions.map(q => ({ ...q, visible: false })) }]
    });

    // Set the initial question visible
    const initialQuestionName = eligibilityConfig.flow.start[0];
    const initialQuestion = newSurvey.getQuestionByName(initialQuestionName);
    if (initialQuestion) {
      initialQuestion.visible = true;
    }

    newSurvey.onValueChanged.add((sender, options) => {
        const answers = sender.data;
        const currentQuestionName = options.name;
        const logic = eligibilityConfig.flow.logic[currentQuestionName];
      
        if (logic) {
          let movedToNext = false;
          logic.next.forEach(conditionObj => {
            const isEligible = evaluateCondition(conditionObj.condition, answers, eligibilityConfig.programs);
            console.log("Evaluating condition:", conditionObj.condition, "with values:", answers, "Result:", isEligible);
      
            // Check if current question has program mappings
            const question = eligibilityConfig.questions.find(q => q.name === currentQuestionName);
            if (question && question.programs) {
              question.programs.forEach(program => {
                // Update eligibility status for each related program
                setEligibilityStatus(prevStatus => {
                  const updatedStatus = {
                    ...prevStatus,
                    [program]: isEligible ? true : prevStatus[program] // Only set to true if eligible
                  };
                  console.log(`Updated eligibility for ${program}: ${updatedStatus[program]}`);
                  return updatedStatus;
                });
              });
            }
      
            // Move to the next question if eligible
            if (isEligible && !movedToNext) {
              const nextQuestion = newSurvey.getQuestionByName(conditionObj.next_question);
              if (nextQuestion) {
                nextQuestion.visible = true;
                movedToNext = true;
                newSurvey.render();
              } else if (conditionObj.next_question.startsWith("eligible_for")) {
                const program = conditionObj.program.toLowerCase();
                setResults(eligibilityConfig.outcomes[`eligible_for_${program}`]);
                newSurvey.completeLastPage();
                movedToNext = true;
              } else if (conditionObj.next_question === "ineligible_all") {
                setResults(eligibilityConfig.outcomes.ineligible_all);
                newSurvey.completeLastPage();
                movedToNext = true;
              }
            }
          });
      
          // Manually advance to the next page if needed
          if (!movedToNext) {
            newSurvey.nextPage();
          }
        }
      });      
      

    setSurvey(newSurvey);
  }, []);

  function evaluateCondition(condition, answers, programs) {
    const conditionWithValues = condition.replace(/{(.*?)}/g, (_, varName) => {
      const [mainKey, subKey, index] = varName.split(".");
  
      // Handle complex variables like `programs.Lifeline.income_limits[householdSize]`
      if (mainKey === "programs" && subKey && index) {
        const householdSize = answers.householdSize;
        const limit = programs[subKey]?.income_limits[householdSize] || 0;
        console.log(`Accessing income limit for ${subKey} with householdSize ${householdSize}:`, limit);
        return limit;
      }
  
      // Handle simple variables like `monthlyIncome` and `householdSize`
      const value = answers[varName];
      console.log(`Replacing variable ${varName} with value:`, value);
      return typeof value === "string" ? `"${value}"` : value || 0;
    });
  
    console.log("Evaluating condition string:", conditionWithValues);
  
    try {
      const result = eval(conditionWithValues);
      console.log("Condition result:", result);
      return result;
    } catch (error) {
      console.error("Condition evaluation error:", error);
      return false;
    }
  }  
  

  return (
    <div id="surveyContainer">
      {results ? (
        <div>
          <h2>Eligibility Results:</h2>
          <p>{results}</p>
          <h3>Program Eligibility Summary:</h3>
          <ul>
            {Object.entries(eligibilityStatus).map(([program, eligible]) => (
              <li key={program}>
                {program}: {eligible ? "Eligible" : "Not Eligible"}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        survey && <Survey model={survey} />
      )}
    </div>
  );
}

export default EligibilityScreen;
