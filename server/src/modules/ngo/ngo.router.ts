import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  careCentreListSchema,
  createCareCentreSchema,
  updateCareCentreSchema,
} from "./ngo.schema.js";
import {
  beneficiaryListSchema,
  createBeneficiarySchema,
  updateBeneficiarySchema,
} from "./beneficiary.schema.js";
import * as ngoService from "./ngo.service.js";
import * as beneficiaryService from "./beneficiary.service.js";
import { saveBeneficiaryAvatar } from "./beneficiary-storage.service.js";

const router = Router();

const route =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };

router.use(authenticate);
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

router.get(
  "/overview",
  authorize("ngo.view"),
  route(async (_req, res) => {
    res.json({ overview: await ngoService.getNgoOverview() });
  }),
);

router.get(
  "/centres",
  authorize("ngo.centres.view"),
  route(async (req, res) => {
    res.json(
      await ngoService.listCareCentres(careCentreListSchema.parse(req.query)),
    );
  }),
);

router.get(
  "/centre-managers",
  authorize("ngo.centres.manage"),
  route(async (_req, res) => {
    res.json({ managers: await ngoService.listCentreManagers() });
  }),
);

router.get(
  "/beneficiary-options",
  authorize("ngo.beneficiaries.manage"),
  route(async (_req, res) => {
    res.json(await beneficiaryService.listBeneficiaryOptions());
  }),
);

router.get(
  "/beneficiaries",
  authorize("ngo.beneficiaries.view"),
  route(async (req, res) => {
    res.json(
      await beneficiaryService.listBeneficiaries(
        beneficiaryListSchema.parse(req.query),
      ),
    );
  }),
);

router.post(
  "/beneficiaries",
  authorize("ngo.beneficiaries.manage"),
  route(async (req, res) => {
    const parsed = createBeneficiarySchema.parse(req.body);
    const avatarUrl = parsed.avatarBase64
      ? await saveBeneficiaryAvatar(parsed.avatarBase64)
      : parsed.avatarUrl;
    const beneficiary = await beneficiaryService.createBeneficiary(req.user!, {
      ...parsed,
      avatarUrl,
    });
    res.status(201).json({ beneficiary });
  }),
);

router.get(
  "/beneficiaries/:id",
  authorize("ngo.beneficiaries.view"),
  route(async (req, res) => {
    res.json({
      beneficiary: await beneficiaryService.getBeneficiary(
        req.params.id as string,
      ),
    });
  }),
);

router.patch(
  "/beneficiaries/:id",
  authorize("ngo.beneficiaries.manage"),
  route(async (req, res) => {
    const parsed = updateBeneficiarySchema.parse(req.body);
    const avatarUrl = parsed.avatarBase64
      ? await saveBeneficiaryAvatar(parsed.avatarBase64)
      : parsed.avatarUrl;
    const beneficiary = await beneficiaryService.updateBeneficiary(
      req.user!,
      req.params.id as string,
      { ...parsed, ...(avatarUrl !== undefined ? { avatarUrl } : {}) },
    );
    res.json({ beneficiary });
  }),
);

router.post(
  "/centres",
  authorize("ngo.centres.manage"),
  route(async (req, res) => {
    const centre = await ngoService.createCareCentre(
      req.user!,
      createCareCentreSchema.parse(req.body),
    );
    res.status(201).json({ centre });
  }),
);

router.get(
  "/centres/:id",
  authorize("ngo.centres.view"),
  route(async (req, res) => {
    res.json({
      centre: await ngoService.getCareCentre(req.params.id as string),
    });
  }),
);

router.patch(
  "/centres/:id",
  authorize("ngo.centres.manage"),
  route(async (req, res) => {
    res.json({
      centre: await ngoService.updateCareCentre(
        req.user!,
        req.params.id as string,
        updateCareCentreSchema.parse(req.body),
      ),
    });
  }),
);

router.post(
  "/centres/:id/deactivate",
  authorize("ngo.centres.manage"),
  route(async (req, res) => {
    res.json({
      centre: await ngoService.deactivateCareCentre(
        req.user!,
        req.params.id as string,
      ),
    });
  }),
);

export { router as ngoRouter };
