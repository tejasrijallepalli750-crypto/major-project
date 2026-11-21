export const isDatasetMutationAllowed = (nodeEnv = process.env.NODE_ENV): boolean =>
  nodeEnv?.trim().toLowerCase() !== 'production';
