import { BASELINE, CHALLENGE, CONTEXT, PARAMETERS, PRESETS } from "../model/simulator";
import { TIMELINE_VERSION } from "../model/timeline";

export function ModelNotes() {
  return (
    <section className="notes section-surface" aria-labelledby="notes-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">THE MODEL, OPENLY</span>
          <h2 id="notes-heading">Small enough to inspect.</h2>
        </div>
        <span className="version">{CONTEXT.modelVersion}</span>
      </div>
      <p>
        This is a deterministic educational model. Its coefficients are design assumptions, not
        calibrated human measurements. The body diagram represents the five modelled systems; it
        does not depict accurate anatomy.
      </p>
      <div className="notes-columns">
        <div>
          <h3>One energy budget</h3>
          <p>For mechanical workload W, resting metabolism R, and muscle efficiency η:</p>
          <code>
            Metabolic demand = R + W / η<br />
            Heat production = R + W × (1 / η − 1)
          </code>
          <p>
            Oxygen supply is capped by the minimum of heart delivery, lung exchange, and
            circulation. Pressure-safe metabolic flow is capped at 1250 × circulation multiplier².
            Work cannot exceed oxygen, pressure, cooling, or muscle ceilings.
          </p>
          <p>
            The largest feasible workload is the minimum of those six ceilings. A binding ceiling
            can move when another constraint is relaxed. Tied limits are reported together.
          </p>
        </div>
        <div>
          <h3>Pinned test conditions</h3>
          <dl className="facts">
            <div>
              <dt>Baseline</dt>
              <dd>{BASELINE.version}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>22°C · 40% humidity</dd>
            </div>
            <div>
              <dt>Rest test</dt>
              <dd>0 W external work</dd>
            </div>
            <div>
              <dt>Exertion test</dt>
              <dd>{CHALLENGE.standardWorkW} W external work</dd>
            </div>
            <div>
              <dt>Challenge</dt>
              <dd>{CHALLENGE.id}</dd>
            </div>
          </dl>
          <p>
            Heat removal is a fixed capacity at these conditions. No temperature or humidity
            response curve is claimed. Standardized exertion must stay within oxygen, heat,
            pressure, and mechanical limits. Budgets use full precision, including both −5% and +5%
            boundaries.
          </p>
        </div>
      </div>
      <details>
        <summary>Baseline constants and modification costs</summary>
        <div className="table-scroll">
          <table>
            <caption>Illustrative baseline constants</caption>
            <tbody>
              {Object.entries(BASELINE).map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <caption>
              Cost for a +100% parameter change, scaled linearly. Negative changes reduce these
              costs.
            </caption>
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">Mass (kg)</th>
                <th scope="col">Resting energy (W)</th>
              </tr>
            </thead>
            <tbody>
              {PARAMETERS.map((p) => (
                <tr key={p.id}>
                  <th scope="row">{p.label}</th>
                  <td>{p.massCost}</td>
                  <td>{p.restCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Bounds and 5% steps define the search space. Efficiency changes multiply the baseline
          efficiency of 0.25; +10% means 0.275. Each nonzero parameter counts as one modification,
          including reductions. Repeated preset clicks do not stack.
        </p>
      </details>
      <details>
        <summary>Animal-inspired presets: exact changes, not transplant claims</summary>
        {PRESETS.map((p) => (
          <div className="preset-note" key={p.id}>
            <h3>{p.name}</h3>
            <p>{p.analogy}</p>
            <code>
              {Object.entries(p.changes)
                .map(([k, v]) => `${k}: ${v > 0 ? "+" : ""}${v}%`)
                .join(", ")}
            </code>
          </div>
        ))}
      </details>
      <details open>
        <summary>Lung edits: mechanism determines the tradeoff</summary>
        <p>
          The current slider changes a single assumed gas-exchange ceiling. It does not change
          measured lung volume, ventilation, diffusion capacity, blood oxygen saturation or inspired
          oxygen concentration. Those are different quantities. The{" "}
          <a
            href="https://site.thoracic.org/advocacy-patients/patient-resources/pulmonary-function-tests"
            target="_blank"
            rel="noreferrer"
          >
            American Thoracic Society distinguishes airflow, lung volume and diffusion tests
          </a>
          . A larger exchange ceiling alone does not identify what tissue changed or which organs
          would be harmed.
        </p>
        <ul>
          <li>
            <strong>Greater breathing effort:</strong> in an experiment with seven male cyclists at
            maximal exercise, adding respiratory muscle work reduced leg blood flow. This supports
            competition for blood flow under those conditions; it does not predict permanent leg
            injury or a penalty from every lung-capacity increase.{" "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/9134907/" target="_blank" rel="noreferrer">
              Harms et al., 1997 ↗
            </a>
          </li>
          <li>
            <strong>Overventilation relative to CO₂ production:</strong> experimental
            hyperventilation lowered blood CO₂, raised blood pH and reduced cerebral blood flow in
            healthy volunteers. This is a ventilation/CO₂ mechanism, not an automatic effect of
            better gas diffusion.{" "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/2343589/" target="_blank" rel="noreferrer">
              Bednarczyk et al., 1990 ↗
            </a>
          </li>
          <li>
            <strong>Air trapping and hyperinflation:</strong> a trial in patients with COPD and
            hyperinflation found that treatment reducing hyperinflation improved ventricular
            filling. This supports a lung–heart interaction in that patient group; it does not
            establish that naturally larger healthy lungs damage the heart.{" "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/29477448/" target="_blank" rel="noreferrer">
              CLAIM trial, 2018 ↗
            </a>
          </li>
          <li>
            <strong>High pulmonary capillary pressure:</strong> experiments in rabbits found
            disruption of the blood–gas barrier with protein leakage or hemorrhage at high
            pressures. This establishes a pressure-related injury mechanism in that experiment; its
            thresholds cannot be assigned to a human exchange-capacity slider.{" "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/2055852/" target="_blank" rel="noreferrer">
              West et al., 1991 ↗
            </a>
          </li>
        </ul>
        <p>
          None of these mechanisms is implemented in this simulator. The exchange edit's mass and
          resting-energy costs are chosen coefficients, without empirical calibration. “Valid” means
          the configuration meets the stated game constraints; it does not mean physiologically
          safe. Injury is not assessed, and a harm percentage cannot be inferred.
        </p>
      </details>
      <details>
        <summary>Consequences over time: a separate heat/fluid model</summary>
        <p>
          The workbench also runs {TIMELINE_VERSION}: repeated days of rest, activity and recovery,
          carrying stored heat and sweat-related fluid deficit forward. Temperature and humidity
          affect assumed dry and evaporative heat loss in this model. Heat and water are accounted
          for explicitly; equations, chosen coefficients and source limitations appear beside the
          timeline results. A larger reserve is used only when the task demands it.
        </p>
        <p>
          This is an uncalibrated educational illustration, without a validated predictive horizon.
          Repeated days do not simulate aging. The run stops at its assumed model-domain boundary;
          later outcomes are unknown. No core-temperature prediction, injury diagnosis, life
          expectancy or universal upgrade penalty is computed. Comparisons use a matched elapsed
          interval, and conditional remove-one-edit replays are not additive contributions.
        </p>
        <p>
          Saved experiments may include versioned daily conditions. Older experiments retain their
          original benchmark and have no recorded timeline. The challenge leaderboard continues to
          use only the original pinned steady-state model and score.
        </p>
      </details>
      <details open>
        <summary>What this simulator does not model</summary>
        <p>
          Cellular metabolism, genetics, hormones, immune response, structural injury, blood
          chemistry, nutrition, fatigue over time, acclimation, and species-specific compatibility
          are unsupported. The challenge model is steady-state; the separate timeline adds heat
          storage and sweat-fluid recovery, without survival or lifespan prediction. No LLM
          generates effects, scores, or validity.
        </p>
        <p>
          Body mass is a challenge budget in the steady-state model and scales the timeline's
          assumed heat capacity; it does not change energy demand for moving the body. The
          pressure-safe allowance is an assumed capacity curve, without a model of blood pressure or
          vascular resistance. Those interactions are unsupported.
        </p>
        <p>
          Related preserved experiment:{" "}
          <a href="https://github.com/sarthakagrawal927/materia" target="_blank" rel="noreferrer">
            Materia’s anatomy-and-remedy reference ↗
          </a>
          . Human V2 uses a new schematic and does not reuse Materia’s body renderer, remedies,
          evidence grades, or 3D assets.
        </p>
      </details>
    </section>
  );
}
