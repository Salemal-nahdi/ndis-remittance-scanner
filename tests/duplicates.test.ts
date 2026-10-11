import { describe, expect, it } from "vitest";
import { compareNames, findDuplicateClusters, findNdisNumber, looksLikeOrganisation, nameTokens, type ContactRecord } from "@/lib/duplicates";

// Invented names and numbers only.
const c = (contactId: string, name: string, extra: Partial<ContactRecord> = {}): ContactRecord => ({ contactId, name, ...extra });

describe("nameTokens", () => {
  it("tidies case, order, titles, brackets and NDIS labels", () => {
    expect(nameTokens("Smith, Jane (NDIS)")).toEqual(nameTokens("Ms jane SMITH - Plan Managed"));
    expect(nameTokens("Zoë Brown")).toEqual(["brown", "zoe"]);
  });
  it("maps common nicknames", () => {
    expect(nameTokens("Bob Taylor")).toEqual(nameTokens("Robert Taylor"));
  });
});

describe("compareNames", () => {
  it("matches initials, middle names and typos", () => {
    expect(compareNames(nameTokens("J Citizen"), nameTokens("Jane Citizen"))).not.toBeNull();
    expect(compareNames(nameTokens("Jane Mary Citizen"), nameTokens("Jane Citizen"))).not.toBeNull();
    expect(compareNames(nameTokens("Jane Citizan"), nameTokens("Jane Citizen"))).not.toBeNull();
  });
  it("doesn't match different people with the same surname", () => {
    expect(compareNames(nameTokens("Jane Citizen"), nameTokens("Mark Citizen"))).toBeNull();
  });
});

describe("findDuplicateClusters", () => {
  it("groups likely duplicates and leaves others alone", () => {
    const clusters = findDuplicateClusters([
      c("1", "Jane Citizen"),
      c("2", "Citizen, Jane"),
      c("3", "jane citizen (NDIS)"),
      c("4", "Mark Citizen"),
      c("5", "Alex Example"),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].contactIds).toEqual(["1", "2", "3"]);
    expect(clusters[0].confidence).toBe("high");
  });

  it("links contacts with the same NDIS number even when names differ", () => {
    const clusters = findDuplicateClusters([c("1", "Jane Citizen", { accountNumber: "431 234 567" }), c("2", "J. Smith-Citizen", { accountNumber: "431234567" })]);
    expect(clusters[0].reasons).toContain("Same NDIS number");
  });

  it("doesn't link different participants who share a plan manager's email", () => {
    const email = "accounts@exampleplanmanager.com.au";
    expect(findDuplicateClusters([c("1", "Jane Citizen", { email }), c("2", "Omar Example", { email })])).toEqual([]);
  });
});

describe("NDIS numbers and organisations", () => {
  it("finds a 9-digit number starting with 43", () => {
    expect(findNdisNumber(c("1", "Jane", { accountNumber: "431-234-567" }))).toBe("431234567");
    expect(findNdisNumber(c("1", "Jane", { accountNumber: "12345" }))).toBeNull();
  });
  it("recognises plan managers and businesses", () => {
    expect(looksLikeOrganisation("Example Plan Management Pty Ltd")).toBe(true);
    expect(looksLikeOrganisation("Jane Citizen")).toBe(false);
  });
});
