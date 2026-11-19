import { useT } from "../i18n";

/** Login background: a stylised map of a coastal town in the rain, with one route coloured by flood risk. */
export default function AuthHero() {
  const t = useT();
  // relief contour lines, drawn as gently shifted waves
  const contours = Array.from({ length: 9 }, (_, i) => {
    const y = 90 + i * 62;
    const a = 18 + (i % 3) * 8;
    return `M-20 ${y} C 120 ${y - a}, 220 ${y + a}, 340 ${y - a / 2} S 560 ${y + a}, 640 ${y - a}`;
  });
  // rain streaks at fixed pseudo-random places (no layout shift between renders)
  const drops = Array.from({ length: 70 }, (_, i) => ({
    x: (i * 97) % 620,
    y: (i * 53) % 820,
    d: 0.9 + ((i * 37) % 10) / 10,
    delay: -((i * 13) % 20) / 10,
  }));

  return (
    <section className="auth-hero" aria-hidden>
      <svg className="auth-map" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hero-sky" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor="#0b0b0c" />
            <stop offset="1" stopColor="#1c1c1f" />
          </linearGradient>
          <linearGradient id="hero-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16303b" stopOpacity="0.7" />
            <stop offset="1" stopColor="#0f222b" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <rect width="600" height="800" fill="url(#hero-sky)" />
        {contours.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#ffffff" strokeOpacity={0.04 + (i % 3) * 0.03} strokeWidth="1.2" />
        ))}

        {/* the sea and the coast */}
        <path d="M-10 610 C 120 580, 210 640, 330 600 S 520 560, 620 600 L 620 820 L -10 820 Z" fill="url(#hero-sea)" />
        <path d="M-10 610 C 120 580, 210 640, 330 600 S 520 560, 620 600" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1.5" />

        {/* a wadi down to the sea */}
        <path d="M150 120 C 170 240, 120 330, 190 420 S 230 540, 250 612" fill="none" stroke="#7fb8e6" strokeOpacity="0.4" strokeWidth="2.5" strokeDasharray="1 0" />

        {/* the road network */}
        <g fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeLinecap="round">
          <path d="M40 520 L 560 470" strokeWidth="3" />
          <path d="M80 300 C 220 330, 380 300, 540 340" strokeWidth="2" />
          <path d="M300 120 L 320 560" strokeWidth="2" />
          <path d="M440 180 C 430 300, 470 420, 450 560" strokeWidth="1.5" />
          <path d="M120 420 L 480 400" strokeWidth="1.5" />
          <path d="M200 200 L 260 520" strokeWidth="1.2" />
          <path d="M360 240 L 520 260" strokeWidth="1.2" />
        </g>

        {/* exposed roads (dashed): what the model ranks high, before any rain alert */}
        <g fill="none" stroke="#a5b4fc" strokeWidth="3" strokeDasharray="5 7" strokeOpacity="0.8">
          <path d="M150 560 L 230 552" />
          <path d="M410 520 L 470 514" />
        </g>

        {/* one trip, coloured by level along the way */}
        <g fill="none" strokeLinecap="round" strokeWidth="7">
          <path d="M90 300 C 150 312, 190 318, 230 318" stroke="#f5f5f2" />
          <path d="M230 318 C 260 318, 290 314, 312 312" stroke="#facc15" />
          <path d="M312 312 L 316 420" stroke="#fb923c" />
          <path d="M316 420 L 318 500" stroke="#fb4868" />
          <path d="M318 500 L 440 488 L 520 480" stroke="#f5f5f2" />
        </g>
        <circle cx="90" cy="300" r="9" fill="#22c55e" stroke="#fff" strokeWidth="3" />
        <circle cx="520" cy="480" r="9" fill="#0b0b0c" stroke="#fff" strokeWidth="3" />

        {/* rain */}
        <g className="hero-rain" stroke="#e4e4e7" strokeOpacity="0.3" strokeWidth="1.3" strokeLinecap="round">
          {drops.map((p, i) => (
            <line key={i} x1={p.x} y1={p.y} x2={p.x - 5} y2={p.y + 18} style={{ animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }} />
          ))}
        </g>
      </svg>

      <div className="auth-hero-text">
        <p className="eyebrow">{t("Zone pilote · Nabeul")}</p>
        <h2>{t("Sachez quelles routes s'inondent en premier, avant de partir.")}</h2>
        <ul>
          <li>
            <strong>5 288</strong> {t("tronçons classés par un modèle entraîné sur 13 inondations méditerranéennes")}
          </li>
          <li>
            {t("Alerte quand la pluie sur 24 h dépasse")} <strong>44 mm</strong>
          </li>
          <li>{t("Itinéraire plus sûr proposé automatiquement")}</li>
        </ul>
      </div>
    </section>
  );
}
