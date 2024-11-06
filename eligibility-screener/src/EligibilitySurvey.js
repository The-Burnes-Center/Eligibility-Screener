import React, { useState, useEffect } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import "survey-core/defaultV2.min.css";
import eligibilityConfig from './config/eligibility_config.json';


function EligibilityScreen() {
  const [survey, setSurvey] = useState(null);
  const [results, setResults] = useState(null);

  console.log('new update 4');

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

    // Set up dynamic question handling
    newSurvey.onValueChanged.add((sender, options) => {
      const answers = sender.data;
      const currentQuestionName = options.name;
      console.log("Current question:", currentQuestionName, "Answers:", answers);
      const logic = eligibilityConfig.flow.logic[currentQuestionName];

      if (logic) {
        let movedToNext = false;
        logic.next.forEach(conditionObj => {
          const isEligible = evaluateCondition(conditionObj.condition, answers, eligibilityConfig.programs);
          console.log("Evaluating condition:", conditionObj.condition, "with values:", answers, "Result:", isEligible);

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
  
      if (mainKey === "programs" && subKey && index) {
        return programs[subKey]?.income_limits[index] || 0;
      }
  
      // Wrap string values in quotes
      const value = answers[varName];
      return typeof value === "string" ? `"${value}"` : value || 0;
    });
  
    console.log("Evaluating:", conditionWithValues);
  
    try {
      return eval(conditionWithValues);
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
        </div>
      ) : (
        survey && <Survey model={survey} />
      )}
    </div>
  );
}

export default EligibilityScreen;
