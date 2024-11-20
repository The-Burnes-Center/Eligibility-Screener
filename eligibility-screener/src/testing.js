import { Survey } from "survey-react-ui";
import "survey-core/modern.min.css"; // Import SurveyJS styles
import surveyData from "./config/eligibility_config.json";

// Load your dynamically generated JSON object
const jsonData = {programs = [], criteria = [], questions = [] } = surveyData || {};

const EligibilityScreener = () => {
  // State to track dynamic survey questions and user eligibility
  const [surveyQuestions, setSurveyQuestions] = React.useState([]);
  const [eligibility, setEligibility] = React.useState(
    Object.fromEntries(jsonData.programs.map((p) => [p.id, true])) // Start with all programs eligible
  );

  // Function to dynamically create SurveyJS survey model
  const buildSurvey = () => {
    const filteredQuestions = jsonData.questions.filter((q) =>
      q.criteria_impact.some(({ program_id }) => eligibility[program_id])
    );

    const surveyJson = {
      title: "Eligibility Screener",
      pages: [
        {
          name: "eligibility",
          elements: filteredQuestions.map((q) => ({
            name: q.question,
            type: q.type,
            title: q.question,
            inputType: q.input_type,
            choices: q.options || []
          }))
        }
      ]
    };

    setSurveyQuestions(surveyJson);
  };

  // Function to handle survey completion
  const handleSurveyCompletion = (survey) => {
    const userResponses = survey.data;

    // Dynamically update eligibility based on responses
    const updatedEligibility = { ...eligibility };
    for (const [question, answer] of Object.entries(userResponses)) {
      const questionCriteria = jsonData.questions.find((q) => q.question === question);
      questionCriteria.criteria_impact.forEach(({ program_id, criteria_id }) => {
        const criteria = jsonData.criteria.find((c) => c.id === criteria_id);

        // Evaluate eligibility based on criteria type and comparison
        if (criteria.type === "number") {
          const householdSize = userResponses["What is your household size?"];
          const threshold = criteria.threshold_by_household_size[householdSize];
          if (criteria.comparison === "<=" && answer > threshold) {
            updatedEligibility[program_id] = false;
          }
        } else if (criteria.type === "option") {
          if (!criteria.options.includes(answer)) {
            updatedEligibility[program_id] = false;
          }
        }
      });
    }

    setEligibility(updatedEligibility);

    // Rebuild the survey with updated eligibility
    buildSurvey();
  };

  // Initial build of the survey
  React.useEffect(() => {
    buildSurvey();
  }, [eligibility]);

  return (
    <div>
      <h1>Dynamic Eligibility Screener</h1>
      {surveyQuestions.pages && (
        <Survey
          json={surveyQuestions}
          onComplete={handleSurveyCompletion}
        />
      )}
      <div>
        <h2>Eligibility Results</h2>
        <ul>
          {Object.entries(eligibility).map(([program, isEligible]) => (
            <li key={program}>
              {program}: {isEligible ? "Eligible" : "Ineligible"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default EligibilityScreener;
