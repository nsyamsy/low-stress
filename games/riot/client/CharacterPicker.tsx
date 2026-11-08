import {
  CHARACTER_ACCESSORIES,
  HUMANOID_BODY_VARIANTS,
  HUMANOID_PALETTES,
  MOCHI_ACCENT_COLORS,
  MOCHI_BODY_COLORS,
  MOCHI_SPECIES,
  type CharacterAccessory,
  type HumanoidCustomization,
  type MochiCustomization,
  type MochiSpecies,
  type RiotCharacterCustomization,
} from "../shared/character";
import { AvatarPreview } from "./AvatarPreview";

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

interface CharacterPickerProps {
  value: RiotCharacterCustomization;
  onChange: (next: RiotCharacterCustomization) => void;
  t: TranslateFn;
}

function Swatch({
  color,
  selected,
  label,
  onClick,
}: {
  color: number;
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      className={`h-11 w-11 rounded-full border-2 transition-transform ${
        selected ? "border-accent scale-110" : "border-border"
      }`}
      style={{ backgroundColor: `#${color.toString(16).padStart(6, "0")}` }}
    />
  );
}

function OptionButton({
  selected,
  onClick,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`min-h-11 rounded-lg border px-3 py-2 text-sm transition-colors ${
        selected
          ? "border-accent bg-accent/15 text-accent-text font-semibold"
          : "border-border bg-surface text-text hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Pemilih karakter di lobi (RT-42): Mochi prosedural + Humanoid CC0.
 * Mobile-first: kontrol digulir vertikal, target ketuk >= 44px, dan
 * identitas tidak bergantung warna saja (nama + ikon aksesori selalu ada).
 */
export function CharacterPicker({ value, onChange, t }: CharacterPickerProps) {
  const setMochi = (patch: Partial<MochiCustomization>) => {
    if (value.type !== "mochi") return;
    onChange({ ...value, ...patch });
  };
  const setHumanoid = (patch: Partial<HumanoidCustomization>) => {
    if (value.type !== "humanoid") return;
    onChange({ ...value, ...patch });
  };

  const accessoryOptions: Array<CharacterAccessory | null> = [
    null,
    ...CHARACTER_ACCESSORIES,
  ];

  return (
    <div className="ls-stack">
      <div className="ls-row" role="tablist" aria-label={t("characters.typeLabel")}>
        <OptionButton
          selected={value.type === "mochi"}
          onClick={() =>
            onChange({
              type: "mochi",
              species: "orb",
              bodyColorIndex: 0,
              accentColorIndex: 0,
              accessory: null,
            })
          }
        >
          {t("characters.typeMochi")}
        </OptionButton>
        <OptionButton
          selected={value.type === "humanoid"}
          onClick={() =>
            onChange({
              type: "humanoid",
              bodyVariant: HUMANOID_BODY_VARIANTS[0]!,
              paletteIndex: 0,
              accessory: null,
            })
          }
        >
          {t("characters.typeHumanoid")}
        </OptionButton>
      </div>

      <div className="flex justify-center">
        <AvatarPreview custom={value} size={120} />
      </div>

      {value.type === "mochi" ? (
        <>
          <fieldset className="ls-stack">
            <legend className="ls-text-secondary text-sm">{t("characters.speciesLabel")}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {MOCHI_SPECIES.map((species: MochiSpecies) => (
                <OptionButton
                  key={species}
                  selected={value.species === species}
                  onClick={() => setMochi({ species })}
                >
                  {t(`characters.species.${species}`)}
                </OptionButton>
              ))}
            </div>
          </fieldset>

          <fieldset className="ls-stack">
            <legend className="ls-text-secondary text-sm">{t("characters.bodyColorLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {MOCHI_BODY_COLORS.map((color, i) => (
                <Swatch
                  key={color}
                  color={color}
                  selected={value.bodyColorIndex === i}
                  label={t("characters.colorIndex", { index: i + 1 })}
                  onClick={() => setMochi({ bodyColorIndex: i })}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="ls-stack">
            <legend className="ls-text-secondary text-sm">{t("characters.accentColorLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {MOCHI_ACCENT_COLORS.map((color, i) => (
                <Swatch
                  key={color}
                  color={color}
                  selected={value.accentColorIndex === i}
                  label={t("characters.colorIndex", { index: i + 1 })}
                  onClick={() => setMochi({ accentColorIndex: i })}
                />
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <>
          <fieldset className="ls-stack">
            <legend className="ls-text-secondary text-sm">{t("characters.bodyVariantLabel")}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HUMANOID_BODY_VARIANTS.map((variant) => (
                <OptionButton
                  key={variant}
                  selected={value.bodyVariant === variant}
                  onClick={() => setHumanoid({ bodyVariant: variant })}
                  ariaLabel={variant}
                >
                  {variant.replace("character-", "")}
                </OptionButton>
              ))}
            </div>
          </fieldset>

          <fieldset className="ls-stack">
            <legend className="ls-text-secondary text-sm">{t("characters.paletteLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {HUMANOID_PALETTES.map((color, i) => (
                <Swatch
                  key={color}
                  color={color}
                  selected={value.paletteIndex === i}
                  label={t("characters.colorIndex", { index: i + 1 })}
                  onClick={() => setHumanoid({ paletteIndex: i })}
                />
              ))}
            </div>
          </fieldset>
        </>
      )}

      <fieldset className="ls-stack">
        <legend className="ls-text-secondary text-sm">{t("characters.accessoryLabel")}</legend>
        <div className="flex flex-wrap gap-2">
          {accessoryOptions.map((acc) => (
            <OptionButton
              key={acc ?? "none"}
              selected={value.accessory === acc}
              onClick={() =>
                value.type === "mochi"
                  ? setMochi({ accessory: acc })
                  : setHumanoid({ accessory: acc })
              }
            >
              {acc === null ? t("characters.accessoryNone") : t(`characters.accessories.${acc}`)}
            </OptionButton>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
