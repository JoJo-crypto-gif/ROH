import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as accounting from "./accounting.service.js";
import {
  accountSchema,
  activateAccountingSchema,
  bootstrapSchema,
  cashCountSchema,
  expenseDecisionSchema,
  expenseAttachmentSchema,
  expensePaymentSchema,
  expenseSchema,
  feeMappingSchema,
  journalDecisionSchema,
  journalSchema,
  methodMappingSchema,
  moneyAccountSchema,
  periodStatusSchema,
  reconciliationMatchSchema,
  reconciliationDraftSchema,
  reportQuerySchema,
  reversalDecisionSchema,
  statementImportSchema,
  updateAccountSchema,
} from "./accounting.schema.js";

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
  "/setup",
  authorize("accounting.view"),
  route(async (_req, res) => {
    res.json({ setup: await accounting.getAccountingSetup() });
  }),
);
router.post(
  "/setup/bootstrap",
  authorize("accounting.setup"),
  route(async (req, res) => {
    const input = bootstrapSchema.parse(req.body);
    res.status(201).json({
      setup: await accounting.bootstrapAccounting(
        req.user!.id,
        input.academicYearId,
      ),
    });
  }),
);
router.post(
  "/setup/activate",
  authorize("accounting.setup"),
  route(async (req, res) => {
    res.json(
      await accounting.activateAccounting(
        req.user!.id,
        activateAccountingSchema.parse(req.body),
      ),
    );
  }),
);
router.patch(
  "/periods/:id",
  authorize("accounting.periods.manage"),
  route(async (req, res) => {
    const { status } = periodStatusSchema.parse(req.body);
    res.json({
      period: await accounting.setAccountingPeriodStatus(
        req.user!.id,
        req.params.id as string,
        status,
      ),
    });
  }),
);
router.post(
  "/expenses/:id/attachments",
  authorize("expenses.create"),
  route(async (req, res) => {
    res.status(201).json({
      attachment: await accounting.addExpenseAttachment(
        req.user!.id,
        req.params.id as string,
        expenseAttachmentSchema.parse(req.body),
      ),
    });
  }),
);
router.get(
  "/expenses/:expenseId/attachments/:attachmentId",
  authorize("expenses.view"),
  route(async (req, res) => {
    const attachment = await accounting.getExpenseAttachment(
      req.params.expenseId as string,
      req.params.attachmentId as string,
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${attachment.filename.replace(/[\"\\r\\n]/g, "_")}\"`,
    );
    res.send(attachment.data);
  }),
);

router.get(
  "/accounts",
  authorize("accounting.view"),
  route(async (req, res) => {
    res.json({
      accounts: await accounting.listAccounts(
        req.query.includeArchived === "true",
      ),
    });
  }),
);
router.post(
  "/accounts",
  authorize("accounting.setup"),
  route(async (req, res) => {
    res.status(201).json({
      account: await accounting.createAccount(
        req.user!.id,
        accountSchema.parse(req.body),
      ),
    });
  }),
);
router.patch(
  "/accounts/:id",
  authorize("accounting.setup"),
  route(async (req, res) => {
    res.json({
      account: await accounting.updateAccount(
        req.user!.id,
        req.params.id as string,
        updateAccountSchema.parse(req.body),
      ),
    });
  }),
);
router.get(
  "/money-accounts",
  authorize("accounting.view", "payments.record", "expenses.pay"),
  route(async (_req, res) => {
    res.json({ moneyAccounts: await accounting.listMoneyAccounts() });
  }),
);
router.post(
  "/money-accounts",
  authorize("accounting.setup"),
  route(async (req, res) => {
    res.status(201).json({
      moneyAccount: await accounting.createMoneyAccount(
        req.user!.id,
        moneyAccountSchema.parse(req.body),
      ),
    });
  }),
);
router.put(
  "/method-mapping",
  authorize("accounting.setup"),
  route(async (req, res) => {
    const input = methodMappingSchema.parse(req.body);
    res.json({
      mapping: await accounting.setPaymentMethodAccount(
        req.user!.id,
        input.method,
        input.moneyAccountId,
      ),
    });
  }),
);
router.put(
  "/fee-mappings",
  authorize("accounting.setup"),
  route(async (req, res) => {
    const input = feeMappingSchema.parse(req.body);
    res.json(await accounting.saveFeeMappings(req.user!.id, input.mappings));
  }),
);

router.get(
  "/journals",
  authorize("accounting.view"),
  route(async (req, res) => {
    res.json({
      journals: await accounting.listJournals({
        fiscalYearId: req.query.fiscalYearId as string | undefined,
        status: req.query.status as never,
      }),
    });
  }),
);
router.post(
  "/journals",
  authorize("journals.create"),
  route(async (req, res) => {
    res.status(201).json({
      journal: await accounting.createManualJournal(
        req.user!.id,
        journalSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/journals/:id/submit",
  authorize("journals.create"),
  route(async (req, res) => {
    res.json({
      journal: await accounting.submitManualJournal(
        req.user!.id,
        req.params.id as string,
      ),
    });
  }),
);
router.post(
  "/journals/:id/decision",
  authorize("journals.approve"),
  route(async (req, res) => {
    const input = journalDecisionSchema.parse(req.body);
    res.json({
      journal: await accounting.decideManualJournal(
        req.user!.id,
        req.params.id as string,
        input.approved,
      ),
    });
  }),
);
router.post(
  "/journals/:id/reverse",
  authorize("journals.reverse"),
  route(async (req, res) => {
    const input = reversalDecisionSchema.parse(req.body);
    res.json({
      journal: await accounting.reverseJournal(
        req.user!.id,
        req.params.id as string,
        input.reason,
      ),
    });
  }),
);

router.get(
  "/expenses",
  authorize("expenses.view"),
  route(async (req, res) => {
    res.json({
      expenses: await accounting.listExpenses(req.query.status as never),
    });
  }),
);
router.post(
  "/expenses",
  authorize("expenses.create"),
  route(async (req, res) => {
    res.status(201).json({
      expense: await accounting.createExpense(
        req.user!.id,
        expenseSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/expenses/:id/submit",
  authorize("expenses.create"),
  route(async (req, res) => {
    res.json({
      expense: await accounting.submitExpense(
        req.user!.id,
        req.params.id as string,
      ),
    });
  }),
);
router.post(
  "/expenses/:id/decision",
  authorize("expenses.approve"),
  route(async (req, res) => {
    const input = expenseDecisionSchema.parse(req.body);
    res.json({
      expense: await accounting.decideExpense(
        req.user!.id,
        req.params.id as string,
        input.approved,
        input.reason,
      ),
    });
  }),
);
router.post(
  "/expenses/:id/payments",
  authorize("expenses.pay"),
  route(async (req, res) => {
    res.status(201).json({
      payment: await accounting.payExpense(
        req.user!.id,
        req.params.id as string,
        expensePaymentSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/expenses/:id/reverse",
  authorize("expenses.reverse"),
  route(async (req, res) => {
    const input = reversalDecisionSchema.parse(req.body);
    res.json({
      expense: await accounting.reverseExpense(
        req.user!.id,
        req.params.id as string,
        input.reason,
      ),
    });
  }),
);

router.get(
  "/reconciliation",
  authorize("reconciliation.view"),
  route(async (req, res) => {
    res.json(
      await accounting.getReconciliationWorkspace(
        req.query.moneyAccountId as string | undefined,
      ),
    );
  }),
);
router.post(
  "/reconciliation/import",
  authorize("reconciliation.manage"),
  route(async (req, res) => {
    res
      .status(201)
      .json(
        await accounting.importBankStatement(
          req.user!.id,
          statementImportSchema.parse(req.body),
        ),
      );
  }),
);
router.post(
  "/reconciliation/matches",
  authorize("reconciliation.manage"),
  route(async (req, res) => {
    const input = reconciliationMatchSchema.parse(req.body);
    res
      .status(201)
      .json(
        await accounting.matchReconciliation(
          req.user!.id,
          input.statementLineId,
          input.matches,
        ),
      );
  }),
);
router.post(
  "/reconciliation/draft-journal",
  authorize("reconciliation.manage", "journals.create"),
  route(async (req, res) => {
    const input = reconciliationDraftSchema.parse(req.body);
    res.status(201).json({
      journal: await accounting.createReconciliationDraftJournal(req.user!.id, input),
    });
  }),
);
router.post(
  "/cash-counts",
  authorize("reconciliation.manage"),
  route(async (req, res) => {
    res.status(201).json({
      cashCount: await accounting.createCashCount(
        req.user!.id,
        cashCountSchema.parse(req.body),
      ),
    });
  }),
);
router.post(
  "/cash-counts/:id/approve",
  authorize("reconciliation.approve"),
  route(async (req, res) => {
    res.json({
      cashCount: await accounting.approveCashCount(
        req.user!.id,
        req.params.id as string,
      ),
    });
  }),
);

router.get(
  "/reports",
  authorize("accounting.reports.view"),
  route(async (req, res) => {
    res.json({
      reports: await accounting.getAccountingReports(
        reportQuerySchema.parse(req.query),
      ),
    });
  }),
);
router.get(
  "/reports/:type/pdf",
  authorize("accounting.reports.view"),
  route(async (req, res) => {
    const type = req.params.type;
    if (
      type !== "trial-balance" &&
      type !== "general-ledger" &&
      type !== "income-statement" &&
      type !== "balance-sheet" &&
      type !== "cash-bank-book" &&
      type !== "expense-register" &&
      type !== "reconciliation-summary" &&
      type !== "receivable-control"
    ) {
      res.status(404).json({ error: "Accounting report not found." });
      return;
    }
    const pdf = await accounting.generateAccountingReportPdf(
      reportQuerySchema.parse(req.query),
      type,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=\"${type}.pdf\"`);
    res.send(pdf);
  }),
);
router.get(
  "/summary",
  authorize("accounting.view"),
  route(async (_req, res) => {
    res.json({ summary: await accounting.getAccountingSummary() });
  }),
);

export { router as accountingRouter };
