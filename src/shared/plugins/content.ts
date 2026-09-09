// Internal title-batch transaction types, not the T2 public content SDK.
export interface ContentSelectionItem {
  ref: string;
  revision: number;
  title: string;
  token: string;
}

export interface ContentApplyBatchOperation {
  expectedRevision: number;
  ref: string;
  set: { title: string };
}

export interface ContentApplyBatchArgs {
  label?: string;
  operationId: string;
  operations: ContentApplyBatchOperation[];
}

export interface ContentApplyBatchResult {
  operationId: string;
  results: Array<{ ref: string; revision: number; title: string }>;
}
