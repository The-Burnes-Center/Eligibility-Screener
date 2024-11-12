import React, { useState, useEffect } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import "survey-core/defaultV2.min.css";
import eligibilityData from './config/flow.json';

function EligibilityScreen() {
  const [survey, setSurvey] = useState(null);
  const [results, setResults] = useState(null);
  const [eligibilityStatus, setEligibilityStatus] = useState(
    Object.fromEntries(eligibilityData.programs.map(program => [program.id, true]))
  );

  useEffect(() => {
    // Initialize SurveyJS model with dynamic question flow
    const surveyModel = new Model({
      title: "Eligibility Screener",
      elements: []
    });

    // Setup questions based on the flow in the JSON
    function setupQuestionFlow() {
      eligibilityData.question_flow.forEach((flowItem, index) => {
        const question = eligibilityData.questions.find(q => q.question === flowItem.question);
        if (question) {
          const surveyElement = {
            name: `q_${index}`,
            title: question.question,
            isRequired: true,
            visible: index === 0, // Only the first question is visible initially
            type: question.input_type === "radio" ? "radiogroup" : "text",
            choices: question.input_type === "radio" ? ["Yes", "No"] : undefined,
            inputType: question.input_type === "text" ? "number" : undefined
          };
          surveyModel.addNewPage("page1").addNewQuestion(surveyElement.type, surveyElement.name);
          surveyModel.getQuestionByName(surveyElement.name).fromJSON(surveyElement);
        }
      });
    }

    // Initialize the question flow
    setupQuestionFlow();

    // Handle value change for each question and update eligibility
    surveyModel.onValueChanged.add((sender, options) => {
      const answers = sender.data;
      const currentQuestionName = options.name;
      const questionIndex = parseInt(currentQuestionName.split("_")[1], 10);
      const flowItem = eligibilityData.question_flow[questionIndex];
      const question = eligibilityData.questions.find(q => q.question === flowItem.question);

      // Initialize a temporary eligibility status to recompute eligibility each time
      const tempEligibilityStatus = { ...eligibilityStatus };

      if (question) {
        question.criteria_impact.forEach(impact => {
          const program = impact.program_id;
          const criteria = eligibilityData.criteria.find(c => c.id === impact.criteria_id);

          if (criteria && tempEligibilityStatus[program]) {
            let ineligible = false;

            if (criteria.type === "number") {
              // Dynamically determine the threshold based on household size if applicable
              let threshold;
              if (criteria.threshold_by_household_size && answers.householdSize) {
                threshold = criteria.threshold_by_household_size[answers.householdSize];
              } else {
                threshold = criteria.threshold;
              }

              if (typeof threshold === "number") {
                ineligible = answers[currentQuestionName] > threshold;
              } else {
                console.warn(`Threshold not defined for household size: ${answers.householdSize}`);
              }
            } else if (criteria.type === "option") {
              // Adjusted comparison for option criteria
              const requiredOption = criteria.options[0];
              if (answers[currentQuestionName] !== requiredOption) {
                ineligible = true;
              }
            }

            if (ineligible) {
              tempEligibilityStatus[program] = false;
            }
          }
        });
      }

      // Only update eligibility status if it differs from current eligibility
      if (JSON.stringify(tempEligibilityStatus) !== JSON.stringify(eligibilityStatus)) {
        setEligibilityStatus(tempEligibilityStatus);
      }

      console.log('Eligibility status overall:', tempEligibilityStatus);

      // Show the next question in the flow, if any
      const nextQuestionIndex = questionIndex + 1;
      if (nextQuestionIndex < eligibilityData.question_flow.length) {
        const nextQuestionName = `q_${nextQuestionIndex}`;
        const nextQuestion = surveyModel.getQuestionByName(nextQuestionName);
        if (nextQuestion) nextQuestion.visible = true;
      } else {
        sender.completeLastPage();
        setResults("Survey Complete. Please review your eligibility.");
      }
    });

    setSurvey(surveyModel);
  }, [eligibilityStatus]);

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
