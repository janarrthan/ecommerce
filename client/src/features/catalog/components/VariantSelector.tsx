import type { Product } from "../catalog.schemas";

type ProductOption = Product["options"][number];

/**
 * Returns the value ID to show as selected in one option's list, or "" for the "Choose size" placeholder.
 *
 * A selection must belong to this option. For example, a stale link that sends Blue's ID as the Size choice shows the
 * placeholder instead of a value that the list does not contain.
 */
function shownValueId(option: ProductOption, selected: Record<string, string>): string {
  return option.values.some((value) => value.id === selected[option.id]) ? selected[option.id] : "";
}

/** Uses stable option-value IDs instead of extracting selections from a display name such as Large / Blue. */
export function VariantSelector({
  product,
  selected,
  onChange,
}: {
  product: Product;
  selected: Record<string, string>;
  onChange: (optionId: string, valueId: string) => void;
}) {
  return (
    <fieldset>
      <legend>Choose your options</legend>
      {product.options.map((option) => (
        <div key={option.id}>
          <label htmlFor={`option-${option.id}`}>{option.name}</label>
          <select
            id={`option-${option.id}`}
            value={shownValueId(option, selected)}
            onChange={(event) => onChange(option.id, event.target.value)}
          >
            <option value="">Choose {option.name.toLowerCase()}</option>
            {option.values.map((value) => (
              <option key={value.id} value={value.id}>
                {value.value}
              </option>
            ))}
          </select>
        </div>
      ))}
    </fieldset>
  );
}
