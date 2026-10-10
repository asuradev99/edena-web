/**
 * Shared chemistry table for the crystal viewer and any future example.
 *
 * Radii are approximate covalent radii in ångström. The colours are CPK hues brightened
 * for a near-black stage: the standard palette is tuned for white paper, and its darker
 * entries (carbon, iron, iodine) vanish against a dark background.
 */
export type ElementAppearance = {
    radius: number;
    color: string;
};
export declare const ELEMENTS: Record<string, ElementAppearance>;
/** Same symbol always gets the same fallback colour, so an unknown element is still trackable. */
export declare function appearanceFor(element: string): ElementAppearance;
