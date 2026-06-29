import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as finance from "./finance.service.js";
import {
  adjustmentSchema,
  creditAllocationSchema,
  debtorListQuerySchema,
  decisionSchema,
  feeItemSchema,
  optionalAssignmentsSchema,
  paymentSchema,
  paymentListQuerySchema,
  receiptListQuerySchema,
  reversalSchema,
  scheduleSchema,
  updateFeeItemSchema,
  updateScheduleSchema,
} from "./finance.schema.js";

const router = Router();
router.use(authenticate);
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});
const route =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    handler(req, res).catch(next);

router.get(
  "/fee-items",
  authorize("fees.view"),
  route(async (req, res) => {
    res.json({
      items: await finance.listFeeItems(req.query.includeArchived === "true"),
    });
  }),
);
router.post(
  "/fee-items",
  authorize("fees.manage"),
  route(async (req, res) => {
    res.status(201).json({
      item: await finance.createFeeItem(
        req.user!.id,
        feeItemSchema.parse(req.body),
      ),
    });
  }),
);
router.patch(
  "/fee-items/:id",
  authorize("fees.manage"),
  route(async (req, res) => {
    res.json({
      item: await finance.updateFeeItem(
        req.user!.id,
        req.params.id as string,
        updateFeeItemSchema.parse(req.body),
      ),
    });
  }),
);

router.get(
  "/schedules",
  authorize("fees.view"),
  route(async (req, res) => {
    res.json({
      schedules: await finance.listSchedules({
        academicYearId: req.query.academicYearId as string | undefined,
        termId: req.query.termId as string | undefined,
        gradeLevelId: req.query.gradeLevelId as string | undefined,
        status: req.query.status as string | undefined,
      }),
    });
  }),
);
router.post(
  "/schedules",
  authorize("fees.manage"),
  route(async (req, res) => {
    res.status(201).json({
      schedule: await finance.createSchedule(
        req.user!.id,
        scheduleSchema.parse(req.body),
      ),
    });
  }),
);
router.patch(
  "/schedules/:id",
  authorize("fees.manage"),
  route(async (req, res) => {
    res.json({
      schedule: await finance.updateSchedule(
        req.user!.id,
        req.params.id as string,
        updateScheduleSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/schedules/:id/submit",
  authorize("fees.manage"),
  route(async (req, res) => {
    res.json({
      schedule: await finance.submitSchedule(
        req.user!.id,
        req.params.id as string,
      ),
    });
  }),
);
router.post(
  "/schedules/:id/publish",
  authorize("fees.publish"),
  route(async (req, res) => {
    res.json(
      await finance.publishSchedule(req.user!.id, req.params.id as string),
    );
  }),
);
router.post(
  "/schedule-lines/:id/assignments",
  authorize("fees.manage"),
  route(async (req, res) => {
    const input = optionalAssignmentsSchema.parse(req.body);
    res.json(
      await finance.assignOptionalFee(
        req.user!.id,
        req.params.id as string,
        input.enrolmentIds,
      ),
    );
  }),
);
router.get(
  "/schedule-lines/:id/assignments",
  authorize("fees.view"),
  route(async (req, res) => {
    res.json({
      assignments: await finance.listOptionalAssignments(
        req.params.id as string,
      ),
    });
  }),
);
router.delete(
  "/schedule-lines/:id/assignments/:enrolmentId",
  authorize("fees.manage"),
  route(async (req, res) => {
    res.json(
      await finance.removeOptionalAssignment(
        req.user!.id,
        req.params.id as string,
        req.params.enrolmentId as string,
      ),
    );
  }),
);

router.get(
  "/students/:studentId/ledger",
  authorize("fees.view"),
  route(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      ledger: await finance.getStudentLedger(req.params.studentId as string),
    });
  }),
);
router.get(
  "/students/:studentId/statement/pdf",
  authorize("fees.view"),
  route(async (req, res) => {
    const document = await finance.getStatementPdf(
      req.params.studentId as string,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.filename}"`,
    );
    res.send(document.buffer);
  }),
);

router.get(
  "/payments",
  authorize("payments.view"),
  route(async (req, res) => {
    res.json(
      await finance.listPayments(paymentListQuerySchema.parse(req.query)),
    );
  }),
);
router.get(
  "/payments/:id",
  authorize("payments.view"),
  route(async (req, res) => {
    res.json({ payment: await finance.getPayment(req.params.id as string) });
  }),
);
router.post(
  "/payments",
  authorize("payments.record"),
  route(async (req, res) => {
    res.status(201).json({
      payment: await finance.recordPayment(
        req.user!.id,
        paymentSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/credits/:id/allocate",
  authorize("credits.allocate"),
  route(async (req, res) => {
    const input = creditAllocationSchema.parse(req.body);
    res.json(
      await finance.allocateCredit(
        req.user!.id,
        req.params.id as string,
        input.allocations,
      ),
    );
  }),
);

router.post(
  "/adjustments",
  authorize("fees.adjust"),
  route(async (req, res) => {
    res.status(201).json({
      adjustment: await finance.requestAdjustment(
        req.user!.id,
        adjustmentSchema.parse(req.body),
      ),
    });
  }),
);
router.get(
  "/adjustments",
  authorize("fees.adjust.approve"),
  route(async (req, res) => {
    res.json({
      adjustments: await finance.listAdjustments(
        req.query.status as string | undefined,
      ),
    });
  }),
);
router.post(
  "/adjustments/:id/decision",
  authorize("fees.adjust.approve"),
  route(async (req, res) => {
    const input = decisionSchema.parse(req.body);
    res.json({
      adjustment: await finance.decideAdjustment(
        req.user!.id,
        req.params.id as string,
        input.approved,
      ),
    });
  }),
);
router.post(
  "/reversals",
  authorize("payments.reverse"),
  route(async (req, res) => {
    const input = reversalSchema.parse(req.body);
    res.status(201).json({
      reversal: await finance.requestReversal(
        req.user!.id,
        input.paymentId,
        input.reason,
      ),
    });
  }),
);
router.get(
  "/reversals",
  authorize("payments.reverse.approve"),
  route(async (req, res) => {
    res.json({
      reversals: await finance.listReversals(
        req.query.status as string | undefined,
      ),
    });
  }),
);
router.post(
  "/reversals/:id/decision",
  authorize("payments.reverse.approve"),
  route(async (req, res) => {
    const input = decisionSchema.parse(req.body);
    res.json({
      reversal: await finance.decideReversal(
        req.user!.id,
        req.params.id as string,
        input.approved,
      ),
    });
  }),
);

router.get(
  "/receipts",
  authorize("receipts.view"),
  route(async (req, res) => {
    res.json(
      await finance.listReceipts(receiptListQuerySchema.parse(req.query)),
    );
  }),
);
router.get(
  "/receipts/:id",
  authorize("receipts.view"),
  route(async (req, res) => {
    res.json({ receipt: await finance.getReceipt(req.params.id as string) });
  }),
);
router.get(
  "/receipts/:id/pdf",
  authorize("receipts.print"),
  route(async (req, res) => {
    const document = await finance.getReceiptPdf(req.params.id as string);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.filename}"`,
    );
    res.send(document.buffer);
  }),
);
router.get(
  "/debtors/filters",
  authorize("debtors.view"),
  route(async (_req, res) => {
    res.json(await finance.getDebtorFilters());
  }),
);
router.get(
  "/debtors",
  authorize("debtors.view"),
  route(async (req, res) => {
    res.json(await finance.listDebtors(debtorListQuerySchema.parse(req.query)));
  }),
);

export { router as financeRouter };
