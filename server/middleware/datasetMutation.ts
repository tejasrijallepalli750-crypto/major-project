import { NextFunction, Request, Response } from 'express';
import { isDatasetMutationAllowed } from '../config/datasetPolicy';

export const allowDatasetMutationOutsideProduction = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!isDatasetMutationAllowed()) {
    res.status(403).json({
      success: false,
      message: 'Dataset file and catalogue mutations are disabled in production.',
    });
    return;
  }

  next();
};
