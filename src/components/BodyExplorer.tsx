import type { KeyboardEvent } from "react";
import type { SystemId } from "../model/simulator";
import { SYSTEMS } from "../model/simulator";

export function BodyExplorer({
  selected,
  onSelect,
  limiting,
}: {
  selected: SystemId;
  onSelect: (id: SystemId) => void;
  limiting: SystemId[];
}) {
  const select = (id: SystemId) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Select ${SYSTEMS.find((x) => x.id === id)?.name}`,
    "aria-pressed": selected === id,
    onClick: () => onSelect(id),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(id);
      }
    },
    className: `organ ${selected === id ? "selected" : ""} ${limiting.includes(id) ? "limiting" : ""}`,
  });
  return (
    <div className="body-figure">
      <div className="figure-canvas">
        {/* biome-ignore lint/a11y/useSemanticElements: Interactive SVG is a named group of organ controls; a fieldset cannot replace SVG. */}
        <svg
          viewBox="0 0 640 610"
          role="group"
          aria-label="Body systems schematic: choose a system to modify"
        >
          <title>Human V2 body systems</title>
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0 0L6 3L0 6" fill="currentColor" />
            </marker>
          </defs>
          <g className="body-outline">
            <path d="M303 27c-22 0-32 17-31 40 1 19 12 35 25 39v17c-26 4-55 7-73 23-20 18-24 48-29 75l-22 95c-5 21-14 58-13 75 1 10 16 12 21 3 9-15 13-40 20-61l31-96c7 29 13 51 8 87-3 20-14 36-17 62-4 36 8 68 14 107l12 87c1 10-7 27-1 32 10 5 27 3 29-5l4-114 18-89 19 89 4 114c2 8 19 10 29 5 6-5-2-22-1-32l12-87c6-39 18-71 14-107-3-26-14-42-17-62-5-36 1-58 8-87l31 96c7 21 11 46 20 61 5 9 20 7 21-3 1-17-8-54-13-75l-22-95c-5-27-9-57-29-75-18-16-47-19-73-23v-17c13-4 24-20 25-39 1-23-9-40-31-40Z" />
            <path
              d="M269 149q34 13 69 0M249 271q54 15 108 0M246 352q23-11 43-3m28 0q20-8 43 3"
              className="body-detail"
            />
          </g>
          <g {...select("cooling")} data-system="cooling">
            <path
              className="cooling-surface"
              d="M223 170q-15 61-33 112m-5 30-10 57m205-199q15 61 33 112m5 30 10 57"
            />
            <path
              className="drop"
              d="M178 221q-14 20 0 20t0-20Zm250 31q-14 20 0 20t0-20Zm-243 63q-14 20 0 20t0-20Z"
            />
            <path className="leader" d="M419 264h55" />
          </g>
          <g {...select("lungs")} data-system="lungs">
            <path
              className="lung"
              d="M289 157c-15-14-35 11-41 43-4 23-8 50 4 60 10 7 33-1 41-10l-4-93Zm30 0c15-14 35 11 41 43 4 23 8 50-4 60-10 7-33-1-41-10l4-93Z"
            />
            <path
              className="airway"
              d="M304 124v69m0-20-30 29m30-29 30 29m-30-9-21 42m21-42 21 42"
            />
            <path className="leader" d="M251 188h-80" />
          </g>
          <g {...select("circulation")} data-system="circulation">
            <path
              className="vessel"
              d="M304 236v123m0-85-58 43m58-43 57 43m-57 34-39 80m39-80 39 80m-39-132-57-36m57 36 51-35m-51-26v-28"
            />
            <path className="vessel thin" d="M264 389v104m79-104v104m-97-176-45 44m160-44 42 44" />
            <path className="leader" d="M308 319h166" />
          </g>
          <g {...select("heart")} data-system="heart">
            <path
              className="heart"
              d="M308 198c-7-12-17-9-23 1-4 8-2 21 4 31 5 9 14 23 24 23 11 0 23-23 24-37 1-13-7-20-17-16l-2-13-10 2Z"
            />
            <path className="heart-detail" d="m314 204 3 28m-24-29 17 11" />
            <path className="leader" d="M331 219h143" />
          </g>
          <g {...select("muscles")} data-system="muscles">
            <path
              className="muscle"
              d="M254 371c-10 15-5 38 0 62l12 42c8-16 14-32 14-54 0-18-4-39-10-50Zm83 0c-6 11-10 32-10 50 0 22 6 38 14 54l12-42c5-24 10-47 0-62Z"
            />
            <path className="muscle-line" d="m261 384 9 61m73-61-9 61" />
            <path className="leader" d="M263 417h-92" />
          </g>
        </svg>
        {SYSTEMS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`body-callout ${s.id} ${selected === s.id ? "active" : ""}`}
            aria-label={`Edit ${s.name}`}
            aria-pressed={selected === s.id}
            onClick={() => onSelect(s.id)}
          >
            <strong>{s.name}</strong>
            <small>
              {
                {
                  heart: "Pumping capacity",
                  lungs: "Oxygen exchange",
                  circulation: "Transport + pressure",
                  muscles: "Work + efficiency",
                  cooling: "Heat removal",
                }[s.id]
              }
            </small>
          </button>
        ))}
      </div>
      <p className="figure-caption">Schematic · not anatomical scale</p>
    </div>
  );
}
