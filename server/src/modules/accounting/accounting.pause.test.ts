import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";
import { schoolAccountingAvailability } from "./accounting.router.js";

test(
  "paused school accounting rejects direct API access before authentication",
  { skip: config.accounting.enabled },
  () => {
    let status = 0;
    let body: { code?: string; error?: string } = {};
    let nextCalled = false;
    const response = {
      setHeader() {},
      status(value: number) {
        status = value;
        return this;
      },
      json(value: typeof body) {
        body = value;
        return this;
      },
    } as unknown as Response;
    schoolAccountingAvailability({} as Request, response, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(status, 503);
    assert.equal(body.code, "SCHOOL_ACCOUNTING_PAUSED");
    assert.match(body.error ?? "", /paused/i);
    assert.equal(nextCalled, false);
  },
);
