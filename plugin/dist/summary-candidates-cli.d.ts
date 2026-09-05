/**
 * Pure disk readers for active change projections.
 *
 * These helpers have no write-side policy. Legacy normalizers are applied
 * in-memory during read so poisoned or
 * pre-migration records still parse, but readers never mutate disk. All durable
 * projection writes route through the storage-owned writer paths (atomic writer
 * / conditional commit primitive). They are the only import surface for routine
 * read-model consumers.
 */

type SummaryCandidateExclusion = {
    id: string;
    reason: "canonical_missing" | "canonical_terminal" | "canonical_error";
    detail?: "schema_error" | "oversized" | "corrupt" | "unreadable" | "read_error";
};
type SummaryCandidateClassification = {
    valid: string[];
    excluded: SummaryCandidateExclusion[];
};
declare function classifySummaryCandidates(changesDir: string, candidateIds: string[]): Promise<SummaryCandidateClassification>;

export { type SummaryCandidateClassification, type SummaryCandidateExclusion, classifySummaryCandidates };
