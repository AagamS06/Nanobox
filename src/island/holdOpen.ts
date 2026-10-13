import { createContext, useContext } from "react";

/**
 * Lets island tabs keep the panel open while something outside it is in
 * progress — e.g. a native "choose folder" dialog, which takes focus away and
 * would otherwise make the island collapse (and unmount the tab) mid-pick.
 */
export const HoldOpenContext = createContext<<T>(work: Promise<T>) => Promise<T>>((work) => work);

export const useHoldOpen = () => useContext(HoldOpenContext);
