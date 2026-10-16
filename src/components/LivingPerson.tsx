import { type CSSProperties, useId } from "react";
import type { SystemId } from "../model/simulator";

interface Props {
  active: boolean;
  systems: boolean;
  selected: SystemId;
  heat: number;
  onSelect: (id: SystemId) => void;
  showCallouts?: boolean;
  measuredRates?: { heart: number; breathing: number };
  compactCallouts?: boolean;
}
export function LivingPerson({
  active,
  systems,
  selected,
  heat,
  onSelect,
  showCallouts = true,
  measuredRates,
  compactCallouts = false,
}: Props) {
  const unique = useId();
  return (
    <div
      className={`living-person ${active ? "working" : "resting"} ${systems ? "systems-visible" : ""}`}
      style={
        measuredRates
          ? ({
              "--heart-period": `${60 / measuredRates.heart}s`,
              "--breath-period": `${60 / measuredRates.breathing}s`,
            } as CSSProperties)
          : undefined
      }
    >
      <svg
        viewBox="0 0 400 590"
        role="img"
        aria-label={
          measuredRates
            ? "Illustrated person; heart and lung pulses follow recorded engine rates"
            : "Original abstract person with a systems overlay; movement illustrates activity, not measured physiological rates"
        }
        onPointerDown={(event) => {
          const system = (event.target as Element)
            .closest("[data-body-system]")
            ?.getAttribute("data-body-system");
          if (system && ["lungs", "heart", "circulation", "muscles", "cooling"].includes(system))
            onSelect(system as SystemId);
        }}
      >
        <defs>
          <linearGradient id={`${unique}-personSkin`} x1="0" x2="1">
            <stop stopColor="#d4a484" />
            <stop offset=".5" stopColor="#e5b998" />
            <stop offset="1" stopColor="#c99272" />
          </linearGradient>
          <linearGradient id={`${unique}-personShirt`} x1="0" x2="1">
            <stop stopColor="#50665a" />
            <stop offset=".5" stopColor="#788b75" />
            <stop offset="1" stopColor="#41584c" />
          </linearGradient>
          <linearGradient id={`${unique}-personLeg`} x1="0" x2="1">
            <stop stopColor="#374e48" />
            <stop offset="1" stopColor="#637768" />
          </linearGradient>
          <radialGradient id={`${unique}-personHeat`}>
            <stop stopColor="#dc7851" stopOpacity=".8" />
            <stop offset="1" stopColor="#e89659" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="203" cy="560" rx="91" ry="10" fill="#344c3e" opacity=".16" />
        <g className="person-rear-arm">
          <path
            d="M237 170Q256 169 264 193L281 271 279 354Q278 369 266 366Q256 362 259 348L258 275 235 224Z"
            fill={`url(#${unique}-personSkin)`}
          />
          <path
            d="M236 162Q263 163 269 206L239 218 220 183Z"
            fill={`url(#${unique}-personShirt)`}
          />
        </g>
        <g className="person-rear-leg">
          <path
            d="M204 314L244 316Q252 359 239 409L237 513Q236 535 219 534Q204 533 207 511L207 412 193 367Z"
            fill={`url(#${unique}-personLeg)`}
          />
          <path
            d="M208 516L236 517 241 548Q257 558 244 562L204 562Q195 558 201 544Z"
            fill="#2d3e37"
          />
          <path d="M205 563h45" stroke="#ada89a" strokeWidth="4" />
        </g>
        <g className="person-front-leg">
          <path
            d="M160 307L206 318 202 403 180 516Q176 535 160 531Q146 527 153 507L166 399 151 356Z"
            fill={`url(#${unique}-personLeg)`}
          />
          <path
            d="M152 513L179 520 177 544Q189 554 177 559L137 557Q130 552 141 544Z"
            fill="#35483d"
          />
          <path d="M137 560l45 1" stroke="#ada89a" strokeWidth="4" />
        </g>
        <path d="M175 136L212 134 222 160 202 182 167 164Z" fill={`url(#${unique}-personSkin)`} />
        <path
          d="M168 156Q145 155 139 179L149 247 143 316Q192 341 245 317L241 240 251 185Q249 160 219 153L202 168 179 166Z"
          fill={`url(#${unique}-personShirt)`}
        />
        <path
          d="M156 181Q175 197 176 307M231 179Q214 202 222 313"
          fill="none"
          stroke="#9eac8e"
          strokeWidth="1.5"
          opacity=".45"
        />
        <path d="M178 159Q189 178 209 159" fill="none" stroke="#334d41" strokeWidth="4" />
        <g className="person-front-arm">
          <path
            d="M141 192Q122 190 122 221L129 294 143 356Q147 374 159 369Q168 363 158 347L151 290 155 216Z"
            fill={`url(#${unique}-personSkin)`}
          />
          <path
            d="M162 159Q133 160 122 198L156 217 178 180Z"
            fill={`url(#${unique}-personShirt)`}
          />
          <path d="M134 246l10 43" stroke="#bf8867" strokeWidth="2" fill="none" />
        </g>
        <path
          d="M163 88Q160 55 190 52Q222 48 231 78L226 113Q219 142 199 143Q174 140 168 120Z"
          fill={`url(#${unique}-personSkin)`}
        />
        <path
          d="M162 96Q146 56 176 41Q209 26 230 52Q244 70 229 93L220 71Q202 80 176 70L172 99Z"
          fill="#343f35"
        />
        <path d="M175 105Q172 94 168 103Q166 118 177 120" fill="#d4a281" />
        <path
          d="M211 89q8-3 12 1M194 91q6-3 11 0"
          stroke="#665846"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M214 98l4 13-7 2M197 122q9 5 17 0"
          stroke="#a06f59"
          strokeWidth="1.5"
          fill="none"
        />
        <circle cx="199" cy="99" r="1.5" fill="#443f33" />
        <circle cx="219" cy="98" r="1.5" fill="#443f33" />
        <ellipse
          cx="196"
          cy="263"
          rx="64"
          ry="116"
          fill={`url(#${unique}-personHeat)`}
          opacity={Math.min(0.7, heat / 3)}
        />
        <g className="person-anatomy">
          <path d="M153 187Q191 171 238 188L232 312Q194 329 150 310Z" fill="#f8f0df" opacity=".9" />
          <path
            className={`organ lungs ${selected === "lungs" ? "selected" : ""}`}
            data-body-system="lungs"
            d="M185 189Q168 185 163 211L157 242Q160 260 185 246ZM203 189Q221 185 227 211L231 242Q225 260 204 246Z"
          />
          <path
            d="M195 177V218M195 201L177 225M195 201L215 225"
            fill="none"
            stroke="#6b9c9d"
            strokeWidth="3"
          />
          <path
            className={`organ circulation ${selected === "circulation" ? "selected" : ""}`}
            data-body-system="circulation"
            d="M195 251V332M195 273L138 286M195 273L264 276M195 332L167 475M195 332L224 478"
            fill="none"
          />
          <path
            className="person-flow"
            d="M195 251V332M195 273L138 286M195 273L264 276M195 332L167 475M195 332L224 478"
            fill="none"
          />
          <path
            className={`organ heart ${selected === "heart" ? "selected" : ""}`}
            data-body-system="heart"
            d="M193 234C182 218 168 232 183 249L197 259 210 243C218 229 201 221 193 234Z"
          />
          <path
            className={`organ muscles ${selected === "muscles" ? "selected" : ""}`}
            data-body-system="muscles"
            d="M169 353L172 412M219 357L224 414"
            fill="none"
            strokeLinecap="round"
          />
        </g>
        <g
          className={`person-sweat ${selected === "cooling" ? "selected" : ""}`}
          data-body-system="cooling"
          fill="none"
          stroke="#4c8793"
          strokeWidth="2"
        >
          <path d="M110 242q-12 13-4 21M288 245q12 13 4 21M115 283q-12 13-4 21M286 288q12 13 4 21" />
        </g>
      </svg>
      {systems && showCallouts && (
        <fieldset className="person-callouts" aria-label="Explore body systems">
          {(
            [
              ["lungs", "Lungs · exchange"],
              ["heart", "Heart · delivery"],
              ["circulation", "Circulation · transport"],
              ["muscles", "Muscles · work"],
              ["cooling", "Cooling · heat loss"],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={`callout callout-${id}`}
              aria-pressed={selected === id}
              aria-label={label}
              onClick={() => onSelect(id)}
            >
              <span />
              {compactCallouts
                ? {
                    lungs: "Lungs",
                    heart: "Heart",
                    circulation: "Blood",
                    muscles: "Muscles",
                    cooling: "Cooling",
                  }[id]
                : label}
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}
