import { useEffect, useRef, useState } from "react";
import { api, type GeocodeItem } from "../api";
import Icon from "./Icons";
import { useT } from "../i18n";

interface Props {
  /** "search": the floating « Où allez-vous ? » bar; "field": a row of the trip card */
  variant: "search" | "field";
  label?: string;
  placeholder: string;
  value: string;
  dot?: string;
  picking?: boolean;
  onPick: (lat: number, lon: number, label: string) => void;
  onPickOnMap?: () => void;
  onLocate?: () => void;
}

/** Place search (Nominatim through the backend), or a point picked on the map. */
export default function PlaceInput({ variant, label, placeholder, value, dot, picking, onPick, onPickOnMap, onLocate }: Props) {
  const t = useT();
  const [text, setText] = useState(value);
  const [items, setItems] = useState<GeocodeItem[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!open || text.trim().length < 3) {
      setItems([]);
      return;
    }
    // Nominatim allows one request per second: wait until typing pauses
    timer.current = window.setTimeout(() => {
      api
        .geocode(text.trim())
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, 700);
    return () => window.clearTimeout(timer.current);
  }, [text, open]);

  const input = (
    <input
      value={text}
      aria-label={label ?? placeholder}
      placeholder={picking ? t("Touchez la carte…") : placeholder}
      onChange={(e) => {
        setText(e.target.value);
        setOpen(true);
      }}
      onBlur={() => window.setTimeout(() => setOpen(false), 200)}
    />
  );

  return (
    <div className={`m-place ${variant}`}>
      {variant === "search" ? (
        <div className="m-search">
          <Icon name="search" size={16} />
          {input}
        </div>
      ) : (
        <div className="m-field-row">
          {dot && <span className="m-dot" style={{ background: dot }} />}
          <div className="m-field">
            {label && <small>{label}</small>}
            {input}
          </div>
          {onLocate && (
            <button type="button" className="m-mini" onClick={onLocate} title={t("Ma position")} aria-label={t("Ma position")}>
              <Icon name="locate" />
            </button>
          )}
          {onPickOnMap && (
            <button
              type="button"
              className={`m-mini ${picking ? "on" : ""}`}
              onClick={onPickOnMap}
              title={t("Choisir sur la carte")}
              aria-label={t("Choisir sur la carte")}
              aria-pressed={picking}
            >
              <Icon name="pin" />
            </button>
          )}
        </div>
      )}
      {open && items.length > 0 && (
        <ul className="suggest">
          {items.map((it) => (
            <li key={`${it.lat},${it.lon}`}>
              <button
                type="button"
                onMouseDown={() => {
                  onPick(it.lat, it.lon, it.name);
                  setOpen(false);
                }}
              >
                <strong>{it.name}</strong>
                <small>{it.address}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
