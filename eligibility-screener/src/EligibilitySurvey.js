import React, { useState, useEffect } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import "survey-core/defaultV2.min.css";
import eligibilityConfig from './config/eligibility_config.json';

function EligibilityScreen() {
  const [survey, setSurvey] = useState(null);
  const [results, setResults] = useState(null);

  useEffect(() => {
    const newSurvey = new Model({
      title: eligibilityConfig.title,
      pages: [{ elements: eligibilityConfig.questions.map(q => ({ ...q, visible: false })) }]
    });

    // Set initial question visible
    const initialQuestionName = eligibilityConfig.flow.start[0];
    const initialQuestion = newSurvey.getQuestionByName(initialQuestionName);
    if (initialQuestion) {
      initialQuestion.visible = true;
    }

    // Set up dynamic question handling
    newSurvey.onValueChanged.add((sender, options) => {
      const answers = sender.data;
      const currentQuestionName = options.name;
      const logic = eligibilityConfig.flow.logic[currentQuestionName];

      if (logic) {
        logic.next.forEach(conditionObj => {
          const isEligible = evaluateCondition(conditionObj.condition, answers, eligibilityConfig.programs);

          if (isEligible) {
            const nextQuestion = newSurvey.getQuestionByName(conditionObj.next_question);
            if (nextQuestion) {
              nextQuestion.visible = true;
              newSurvey.render();
            } else if (conditionObj.next_question.startsWith("eligible_for")) {
              const program = conditionObj.program.toLowerCase();
              setResults(eligibilityConfig.outcomes[`eligible_for_${program}`]);
              newSurvey.completeLastPage();
            } else if (conditionObj.next_question === "ineligible_all") {
              setResults(eligibilityConfig.outcomes.ineligible_all);
              newSurvey.completeLastPage();
            }
          }
        });
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
      return answers[varName] || 0;
    });
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
