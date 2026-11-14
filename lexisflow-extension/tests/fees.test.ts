import { describe, expect, it } from "vitest";
import { selectFeeBlocks, type Block } from "../src/content/scanner";

const blocks = (...texts: string[]): Block[] =>
  texts.map((text) => ({ el: {} as Element, text, kind: "text" as const, alert: null }));
const texts = (selected: Block[]) => selected.map((b) => b.text);

describe("selectFeeBlocks (auto-read fees)", () => {
  it("picks the fee label with its value and the fee rule on the fees step", () => {
    const step = blocks(
      "Frais de transfert",
      "Type d'opération",
      "Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)",
      "Montant à envoyer",
      "Frais",
      "375 FCFA",
      "Total à débiter",
      "25 375 FCFA",
      "Solde après opération",
      "224 625 FCFA",
    );
    expect(texts(selectFeeBlocks(step))).toEqual(["Frais de 1,5 % (min. 100 FCFA, max. 2 500 FCFA)", "Frais", "375 FCFA"]);
  });

  it("includes a free-transfer badge", () => {
    expect(texts(selectFeeBlocks(blocks("Frais", "Gratuit", "0 FCFA", "Total à débiter")))).toEqual([
      "Frais",
      "Gratuit",
      "0 FCFA",
    ]);
  });

  it("works on the summary and receipt lists", () => {
    expect(texts(selectFeeBlocks(blocks("Montant", "25 000 FCFA", "Frais", "375 FCFA", "Total débité", "25 375 FCFA")))).toEqual([
      "Frais",
      "375 FCFA",
    ]);
  });

  it("works on the English page", () => {
    expect(texts(selectFeeBlocks(blocks("Fee", "375 FCFA", "Total debited", "25,375 FCFA")))).toEqual(["Fee", "375 FCFA"]);
    expect(texts(selectFeeBlocks(blocks("Fee of 1.5 % (min. 100 FCFA)")))).toEqual(["Fee of 1.5 % (min. 100 FCFA)"]);
  });

  it("never selects balances, totals or the fees heading", () => {
    expect(selectFeeBlocks(blocks("Solde disponible", "250 000 FCFA", "Total à débiter", "25 375 FCFA", "Frais de transfert"))).toEqual([]);
  });

  it("does not run on past a label whose next block is not a value", () => {
    expect(texts(selectFeeBlocks(blocks("Frais", "Total à débiter", "25 375 FCFA")))).toEqual(["Frais"]);
  });

  it("ignores alerts and typed field values", () => {
    const list: Block[] = [
      { el: {} as Element, text: "Frais", kind: "text", alert: "warning" },
      { el: {} as Element, text: "Frais", kind: "field", alert: null },
    ];
    expect(selectFeeBlocks(list)).toEqual([]);
  });
});
