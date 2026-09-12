import { useId } from "react";
export default function Illustration({
  theme = "forest",
}: {
  theme?: "forest" | "ocean" | "space";
}) {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className={`illustration ${theme}`}
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={
        theme === "forest"
          ? "A little fox discovers a glowing lantern in a magical forest"
          : theme === "ocean"
            ? "A little turtle in a glowing underwater garden"
            : "A moon rabbit beneath a sky full of stars"
      }
    >
      <defs>
        <linearGradient id={`${id}sky`} x2="0" y2="1">
          <stop
            stopColor={
              theme === "ocean"
                ? "#92c6bf"
                : theme === "space"
                  ? "#777ca7"
                  : "#bed0bd"
            }
          />
          <stop
            offset="1"
            stopColor={theme === "space" ? "#cdc8d3" : "#eef0d3"}
          />
        </linearGradient>
        <radialGradient id={`${id}glow`}>
          <stop stopColor="#fffcc7" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff4b0" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}paper`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".6"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope=".09" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
      <g filter={`url(#${id}paper)`}>
        <path fill={`url(#${id}sky)`} d="M0 0h800v600H0z" />
        <circle cx="530" cy="150" r="145" fill={`url(#${id}glow)`} />
        {theme === "forest" && (
          <>
            <g fill="#708f78" opacity=".26">
              <path d="M120 0h40l-8 387H88Z M293 0h23l27 365h-50Z M632 0h24l26 404h-52Z" />
              <ellipse cx="156" cy="77" rx="174" ry="116" />
              <ellipse cx="658" cy="47" rx="191" ry="126" />
            </g>
            <g fill="#6c8e76" opacity=".26">
              <ellipse cx="113" cy="325" rx="188" ry="96" />
              <ellipse cx="652" cy="325" rx="221" ry="99" />
            </g>
            <path d="M0 388Q149 341 324 401T800 368V600H0Z" fill="#92ad88" />
            <path d="M0 491Q170 397 425 441T800 407V600H0Z" fill="#678d71" />
            <path
              d="M421 600Q594 497 492 442T480 359Q401 408 425 446T284 600"
              fill="#dfdab5"
            />
            <path
              d="M44 0H139Q101 201 143 391L186 451L100 429L30 461Q72 307 44 0"
              fill="#556e58"
            />
            <path
              d="M91 9Q89 211 100 319"
              fill="none"
              stroke="#788770"
              strokeWidth="10"
            />
            <path
              d="M736 0H665Q677 129 642 232L581 277L650 264L624 452L697 429L762 461Q697 211 736 0"
              fill="#687961"
            />
            <g fill="#476d55">
              <ellipse cx="32" cy="40" rx="154" ry="92" />
              <ellipse cx="207" cy="-16" rx="170" ry="93" />
              <ellipse cx="747" cy="9" rx="189" ry="98" />
            </g>
            <g fill="#78916b">
              <ellipse cx="90" cy="89" rx="69" ry="46" />
              <ellipse cx="237" cy="20" rx="94" ry="41" />
              <ellipse cx="634" cy="43" rx="78" ry="42" />
            </g>
            <g transform="translate(316 398)">
              <path d="M-21 76Q-124 66-88 9Q-77 46-21 32" fill="#bd7044" />
              <path
                d="M-88 9Q-78 35-58 42L-76 62Q-107 50-88 9"
                fill="#f6e6c7"
              />
              <ellipse cy="33" rx="36" ry="51" fill="#cb8251" />
              <path
                d="m-33-11-5-56 32 32 21 2 30-34-4 61Q0 40-33-11"
                fill="#d89057"
              />
              <path d="m-30-38 2 24 15-9 M30-38l-2 24-15-9" fill="#776453" />
              <path
                d="M-31-6Q-17-18 0 4Q15-19 34-7Q18 28 0 28Q-16 26-31-6"
                fill="#f7e5c6"
              />
              <ellipse cx="-15" cy="-2" rx="3" ry="4" fill="#413f35" />
              <ellipse cx="17" cy="-2" rx="3" ry="4" fill="#413f35" />
              <path d="m-5 12 10 0-5 5Z" fill="#413f35" />
              <path
                d="M-11 50v27M15 50v27"
                stroke="#9b603e"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path d="M-8 33q8 18 16 0" fill="#f7e5c6" />
            </g>
            <g transform="translate(453 414)">
              <circle r="85" fill={`url(#${id}glow)`} />
              <path
                d="M-13-23h26l5 41h-36Z"
                fill="#d4ab59"
                stroke="#7f7c4e"
                strokeWidth="3"
              />
              <path
                d="M-9-21v-10q9-15 18 0v10"
                fill="none"
                stroke="#7f7c4e"
                strokeWidth="4"
              />
              <path d="M-9-15H9v24H-9Z" fill="#fff3b3" />
              <circle cy="-2" r="5" fill="#fffce0" />
            </g>
          </>
        )}
        {theme === "ocean" && (
          <>
            <path d="M0 459Q215 393 434 475T800 444V600H0Z" fill="#dcd7b7" />
            <g
              stroke="#6a9980"
              strokeWidth="15"
              fill="none"
              strokeLinecap="round"
            >
              <path d="M83 600q-40-80 2-170t-14-136M127 600q60-113 8-163M686 600q-42-147 10-225M725 600q52-144 13-187" />
            </g>
            <g transform="translate(373 379)">
              <ellipse rx="88" ry="61" fill="#658f77" />
              <path d="M-62 0q62-81 124 0-62 66-124 0" fill="#8ca786" />
              <path
                d="m0-44-30 44 30 41 33-41Z"
                fill="none"
                stroke="#628a70"
                strokeWidth="5"
              />
              <ellipse cx="104" cy="4" rx="34" ry="27" fill="#abb797" />
              <circle cx="118" cy="-3" r="4" fill="#395a52" />
              <ellipse cx="-48" cy="55" rx="33" ry="14" fill="#abb797" />
              <ellipse cx="47" cy="56" rx="33" ry="14" fill="#abb797" />
            </g>
            <g fill="none" stroke="#e8f0dd" strokeWidth="3" opacity=".6">
              <circle cx="496" cy="281" r="12" />
              <circle cx="521" cy="239" r="7" />
              <circle cx="494" cy="204" r="16" />
            </g>
            <g fill="#dcb5a0">
              <path d="M601 521q-60-53-5-83 38 6 20 62 56-66 72-22-17 42-87 43" />
              <path d="M191 540q-69-34-40-64 26-18 42 37 4-62 34-42 23 26-36 69" />
            </g>
          </>
        )}
        {theme === "space" && (
          <>
            <circle cx="545" cy="133" r="58" fill="#f2e2b7" />
            <circle cx="571" cy="115" r="53" fill="#898cab" />
            <path d="M0 450Q277 332 512 443T800 418V600H0Z" fill="#c9c7cf" />
            <ellipse cx="172" cy="489" rx="80" ry="17" fill="#b0b1c3" />
            <ellipse cx="621" cy="541" rx="101" ry="20" fill="#b0b1c3" />
            <g transform="translate(380 389)" fill="#eee7d9">
              <ellipse cy="44" rx="45" ry="55" />
              <ellipse cy="-13" rx="44" ry="40" />
              <ellipse
                cx="-22"
                cy="-67"
                rx="13"
                ry="47"
                transform="rotate(-12 -22 -67)"
              />
              <ellipse
                cx="22"
                cy="-67"
                rx="13"
                ry="47"
                transform="rotate(12 22 -67)"
              />
              <g fill="#dfc3bf">
                <ellipse
                  cx="-22"
                  cy="-70"
                  rx="6"
                  ry="28"
                  transform="rotate(-12 -22 -70)"
                />
                <ellipse
                  cx="22"
                  cy="-70"
                  rx="6"
                  ry="28"
                  transform="rotate(12 22 -70)"
                />
              </g>
              <g fill="#59566c">
                <circle cx="-15" cy="-16" r="4" />
                <circle cx="15" cy="-16" r="4" />
              </g>
              <path d="m-4-5 8 0-4 5Z" fill="#d1a6a4" />
              <path d="M-38 16q38 29 76 0v17q-38 27-76 0" fill="#b89c71" />
            </g>
          </>
        )}
        <g fill="#fff8c5">
          {Array.from({ length: 22 }, (_, i) => (
            <circle
              key={i}
              className="firefly"
              style={{ animationDelay: `${i * 0.27}s` }}
              cx={75 + ((i * 137) % 670)}
              cy={105 + ((i * 79) % 370)}
              r={i % 3 === 0 ? 3.5 : 2}
            />
          ))}
        </g>
        <g fill={theme === "space" ? "#9499b3" : "#3e7057"} opacity=".85">
          <path d="M0 600v-85q61-79 87 14 59-105 103 19 77-66 97 52ZM800 600V472q-63-44-74 57-74-76-108 30-61-52-70 41Z" />
        </g>
        {theme !== "space" && (
          <g fill="#f4d799">
            {[38, 135, 203, 649, 712, 769].map((x, i) => (
              <g key={x} transform={`translate(${x} ${548 + (i % 3) * 14})`}>
                <path d="M0 14V0" stroke="#bbce98" strokeWidth="2" />
                <circle r="5" />
                <circle cy="-5" r="4" />
                <circle cx="-5" r="4" />
                <circle cx="5" r="4" />
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
