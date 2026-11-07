/**
 * Register a component once. Keeps the definition guard in one place so every
 * kit component follows the same import-time contract.
 */
export function defineUiComponent(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}
