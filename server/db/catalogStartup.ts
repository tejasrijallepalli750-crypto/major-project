export const runCatalogStartupMaintenance = async (
  nodeEnv: string | undefined,
  disableGeneratedLegacyProducts: () => Promise<void>,
  seedCatalogIfMissing: () => Promise<void>,
): Promise<void> => {
  if (nodeEnv?.trim().toLowerCase() === 'production') return;

  await disableGeneratedLegacyProducts();
  await seedCatalogIfMissing();
};
