/*
 * Browser Sale Cloner for Lightspeed Retail API.
 *
 * Runs in browser console or Tampermonkey on a Lightspeed page.
 *
 * 1) GET /Sale/{saleID}.json?load_relations=all
 * 2) Strip non-postable/read-only fields
 * 3) Optionally force all SaleLine.taxClassID values
 * 4) POST /Sale.json
 */

(async function runCloneSaleInBrowser() {
  const config = {
    accountId: window.merchantos.account.id,
    saleId: "",
    saleIdsRaw: "",
    baseUrl: "https://us.merchantos.com",
    apiPathPrefix: "/API",
    token: "", // Optional: Bearer token. Leave blank to use logged-in browser session.

    // Behavior
    taxClassId: "", // Required: all cloned lines will be forced to this taxClassID.
    complete: false,
    paymentTypeId: "24",
    paymentAmount: "", // Optional manual override when complete=true.
    dryRun: true,
    useConfigWindow: true,
    ensurePaymentObjectWhenMissing: true,
    matchPaymentAmountToSaleTotal: true,
    retryOutOfBalanceOnce: true,
    keepOriginalCompleteTime: true,
    exportBatchMappingCsv: true,
    cooldownEvery: 25,
    cooldownMs: 2000,

    // Debug / testing
    sourceEnvelope: null // Optional: paste a Sale envelope object to skip live GET.
  };

  function createConfigWindow(baseConfig) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "2147483647";
      overlay.style.background = "rgba(9, 14, 22, 0.48)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.padding = "24px";

      const panel = document.createElement("div");
      panel.style.width = "100%";
      panel.style.maxWidth = "620px";
      panel.style.background = "#ffffff";
      panel.style.borderRadius = "14px";
      panel.style.boxShadow = "0 18px 50px rgba(6, 24, 44, 0.25)";
      panel.style.padding = "20px";
      panel.style.fontFamily = "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial";
      panel.style.color = "#111827";

      const title = document.createElement("h2");
      title.textContent = "Clone Lightspeed Sale";
      title.style.margin = "0 0 8px";
      title.style.fontSize = "20px";

      const subtitle = document.createElement("p");
      subtitle.textContent = "Review options and run as dry-run first.";
      subtitle.style.margin = "0 0 16px";
      subtitle.style.color = "#4b5563";
      subtitle.style.fontSize = "13px";

      const form = document.createElement("form");
      form.style.display = "grid";
      form.style.gridTemplateColumns = "1fr 1fr";
      form.style.gap = "10px";

      function field(labelText, input) {
        const wrap = document.createElement("label");
        wrap.style.display = "grid";
        wrap.style.gap = "6px";
        wrap.style.fontSize = "12px";
        wrap.style.fontWeight = "600";

        const label = document.createElement("span");
        label.textContent = labelText;
        label.style.color = "#374151";

        input.style.padding = "9px 10px";
        input.style.border = "1px solid #d1d5db";
        input.style.borderRadius = "8px";
        input.style.fontSize = "13px";
        input.style.outline = "none";

        wrap.append(label, input);
        return wrap;
      }

      function checkbox(labelText, checked) {
        const wrap = document.createElement("label");
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "8px";
        wrap.style.fontSize = "13px";
        wrap.style.fontWeight = "600";
        wrap.style.color = "#1f2937";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(checked);
        input.style.width = "16px";
        input.style.height = "16px";

        const text = document.createElement("span");
        text.textContent = labelText;

        wrap.append(input, text);
        return { wrap, input };
      }

      const accountIdInput = document.createElement("input");
      accountIdInput.value = baseConfig.accountId || "";

      const saleIdInput = document.createElement("input");
      saleIdInput.value = baseConfig.saleId || "";

      const saleIdsInput = document.createElement("textarea");
      saleIdsInput.value = baseConfig.saleIdsRaw || baseConfig.saleId || "";
      saleIdsInput.rows = 4;
      saleIdsInput.placeholder = "One sale ID per line, or comma-separated";

      const taxClassIdInput = document.createElement("input");
      taxClassIdInput.value = baseConfig.taxClassId || "";

      const paymentTypeIdInput = document.createElement("input");
      paymentTypeIdInput.value = baseConfig.paymentTypeId || "24";

      const paymentAmountInput = document.createElement("input");
      paymentAmountInput.value = baseConfig.paymentAmount || "";

      const cooldownEveryInput = document.createElement("input");
      cooldownEveryInput.value = String(baseConfig.cooldownEvery || 25);

      const cooldownMsInput = document.createElement("input");
      cooldownMsInput.value = String(baseConfig.cooldownMs || 2000);

      const tokenInput = document.createElement("input");
      tokenInput.value = baseConfig.token || "";
      tokenInput.type = "password";

      const completeCheck = checkbox("Mark cloned sale completed", baseConfig.complete);
      const dryRunCheck = checkbox("Dry run only (do not POST)", baseConfig.dryRun);
      const ensurePaymentCheck = checkbox("Create payment object when source has none", baseConfig.ensurePaymentObjectWhenMissing);
      const matchPaymentAmountCheck = checkbox("Set payment amount equal to sale total", baseConfig.matchPaymentAmountToSaleTotal);
      const retryOutOfBalanceCheck = checkbox("Retry once if out of balance (apply server balance)", baseConfig.retryOutOfBalanceOnce);
      const keepOriginalCompleteTimeCheck = checkbox("Keep original completed date/time", baseConfig.keepOriginalCompleteTime);
      const exportBatchMappingCsvCheck = checkbox("Export Original->New mapping CSV", baseConfig.exportBatchMappingCsv);

      const fullWidth = document.createElement("div");
      fullWidth.style.gridColumn = "1 / -1";
      fullWidth.style.display = "grid";
      fullWidth.style.gap = "10px";

      const saleIdsField = field("Source Sale IDs (multi)", saleIdsInput);
      saleIdsField.style.gridColumn = "1 / -1";

      form.append(
        field("Account ID", accountIdInput),
        field("Source Sale ID (single)", saleIdInput),
        field("Tax Class ID (required)", taxClassIdInput),
        field("Payment Type ID", paymentTypeIdInput),
        field("Payment Amount Override (optional)", paymentAmountInput),
        field("Cooldown Every N Sales", cooldownEveryInput),
        field("Cooldown Duration Ms", cooldownMsInput),
        field("Bearer Token (optional)", tokenInput)
      );
      form.append(saleIdsField);

      fullWidth.append(
        completeCheck.wrap,
        dryRunCheck.wrap,
        ensurePaymentCheck.wrap,
        matchPaymentAmountCheck.wrap,
        retryOutOfBalanceCheck.wrap,
        keepOriginalCompleteTimeCheck.wrap,
        exportBatchMappingCsvCheck.wrap
      );
      form.append(fullWidth);

      const footer = document.createElement("div");
      footer.style.marginTop = "16px";
      footer.style.display = "flex";
      footer.style.justifyContent = "flex-end";
      footer.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.padding = "8px 12px";
      cancelBtn.style.borderRadius = "8px";
      cancelBtn.style.border = "1px solid #d1d5db";
      cancelBtn.style.background = "#ffffff";
      cancelBtn.style.cursor = "pointer";

      const runBtn = document.createElement("button");
      runBtn.type = "button";
      runBtn.textContent = "Run";
      runBtn.style.padding = "8px 14px";
      runBtn.style.borderRadius = "8px";
      runBtn.style.border = "1px solid #1d4ed8";
      runBtn.style.background = "#2563eb";
      runBtn.style.color = "#ffffff";
      runBtn.style.cursor = "pointer";

      footer.append(cancelBtn, runBtn);
      panel.append(title, subtitle, form, footer);
      overlay.append(panel);
      document.body.append(overlay);

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      cancelBtn.addEventListener("click", () => close(null));
      runBtn.addEventListener("click", () => {
        form.requestSubmit();
      });
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        close({
          ...baseConfig,
          accountId: accountIdInput.value.trim(),
          saleId: saleIdInput.value.trim(),
          saleIdsRaw: saleIdsInput.value.trim(),
          taxClassId: taxClassIdInput.value.trim(),
          paymentTypeId: paymentTypeIdInput.value.trim() || "24",
          paymentAmount: paymentAmountInput.value.trim(),
          cooldownEvery: cooldownEveryInput.value.trim(),
          cooldownMs: cooldownMsInput.value.trim(),
          token: tokenInput.value.trim(),
          complete: completeCheck.input.checked,
          dryRun: dryRunCheck.input.checked,
          ensurePaymentObjectWhenMissing: ensurePaymentCheck.input.checked,
          matchPaymentAmountToSaleTotal: matchPaymentAmountCheck.input.checked,
          retryOutOfBalanceOnce: retryOutOfBalanceCheck.input.checked,
          keepOriginalCompleteTime: keepOriginalCompleteTimeCheck.input.checked,
          exportBatchMappingCsv: exportBatchMappingCsvCheck.input.checked
        });
      });
    });
  }

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toBatchMappingCsv(mapping) {
  const header = ["sourceSaleID", "createdSaleID", "status", "outOfBalanceRetryApplied", "error"];
  const lines = [header.join(",")];
  for (const row of mapping) {
    lines.push([
      csvEscape(row.sourceSaleID),
      csvEscape(row.createdSaleID),
      csvEscape(row.status),
      csvEscape(row.outOfBalanceRetryApplied),
      csvEscape(row.error || "")
    ].join(","));
  }
  return lines.join("\n");
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function parseSaleIdList(options) {
  const fromRaw = String(options.saleIdsRaw || "")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);

  if (fromRaw.length > 0) {
    return [...new Set(fromRaw)];
  }

  if (options.saleId) {
    return [String(options.saleId).trim()];
  }

  return [];
}

function requireTaxClassId(options) {
  const taxClassId = String(options.taxClassId || "").trim();
  if (!taxClassId) {
    throw new Error("Tax Class ID is required.");
  }
  return taxClassId;
}

function toPositiveInteger(value, fallback) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const numericValue = Number(trimmed);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`Expected a non-negative integer but received: ${value}`);
  }

  return numericValue;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function pick(source, allowedKeys) {
  const output = {};
  for (const key of allowedKeys) {
    if (source[key] !== undefined) {
      output[key] = source[key];
    }
  }
  return output;
}

function toNumber(value, fallback = 0) {
  const normalized = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return normalized;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inferSaleTotal(sale) {
  const candidates = [sale.totalDue, sale.total, sale.calcTotal, sale.displayableTotal];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return roundCurrency(toNumber(candidate)).toFixed(2);
    }
  }

  const lines = normalizeList(sale?.SaleLines?.SaleLine);
  let subtotal = 0;
  for (const line of lines) {
    const qty = toNumber(line.unitQuantity, 1);
    const unitPrice = toNumber(line.unitPrice, 0);
    const discountAmount = toNumber(line.discountAmount, 0);
    const discountPercent = toNumber(line.discountPercent, 0);
    const gross = qty * unitPrice;
    const lineTotal = gross - discountAmount - gross * discountPercent;
    subtotal += lineTotal;
  }

  return roundCurrency(subtotal).toFixed(2);
}

function isTruthyString(value) {
  return String(value).toLowerCase() === "true";
}

function normalizeTaxCategoryPayload(payload) {
  const raw = payload?.TaxCategory;
  if (!raw) {
    return null;
  }
  if (Array.isArray(raw)) {
    return raw[0] || null;
  }
  return raw;
}

function calculateSaleTotalFromTaxCategory(sourceSale, taxCategory) {
  const lines = normalizeList(sourceSale?.SaleLines?.SaleLine);
  let subtotal = 0;
  let taxableSubtotal = 0;

  for (const line of lines) {
    const qty = toNumber(line.unitQuantity, 1);
    const unitPrice = toNumber(line.unitPrice, 0);
    const discountAmount = toNumber(line.discountAmount, 0);
    const discountPercent = toNumber(line.discountPercent, 0);
    const gross = qty * unitPrice;
    const lineTotal = gross - discountAmount - gross * discountPercent;

    subtotal += lineTotal;
    if (isTruthyString(line.tax)) {
      taxableSubtotal += lineTotal;
    }
  }

  const tax1Rate = toNumber(taxCategory?.tax1Rate, 0);
  const tax2Rate = toNumber(taxCategory?.tax2Rate, 0);
  const isTaxInclusive = isTruthyString(sourceSale?.isTaxInclusive) || isTruthyString(taxCategory?.isTaxInclusive);
  const taxAmount = isTaxInclusive ? 0 : (taxableSubtotal * (tax1Rate + tax2Rate));
  return roundCurrency(subtotal + taxAmount).toFixed(2);
}

function resolvePaymentAmount(sourceSale, options) {
  if (options.matchPaymentAmountToSaleTotal) {
    return options.calculatedSaleTotal || inferSaleTotal(sourceSale);
  }
  return options.paymentAmount || options.calculatedSaleTotal || inferSaleTotal(sourceSale);
}

function resolveCompleteTime(sourceSale) {
  return sourceSale.completeTime || sourceSale.updateTime || sourceSale.timeStamp || sourceSale.createTime || "";
}

function isOutOfBalanceError(error) {
  return error?.response?.errorClass === "OutOfBalanceError";
}

function hasServerCreatedSaleId(error) {
  return Boolean(error?.response?.saleID);
}

function applyOutOfBalanceDeltaToFirstPayment(salePayload, balanceValue) {
  const payments = normalizeList(salePayload?.SalePayments?.SalePayment);
  if (payments.length === 0) {
    throw new Error("Out-of-balance retry requested but no SalePayment exists in payload.");
  }

  const currentAmount = toNumber(payments[0].amount, 0);
  const delta = toNumber(balanceValue, 0);
  const adjustedAmount = roundCurrency(currentAmount + delta).toFixed(2);

  payments[0] = {
    ...payments[0],
    amount: String(adjustedAmount)
  };

  salePayload.SalePayments = { SalePayment: payments };
  return adjustedAmount;
}

function buildOutOfBalanceRetryUpdatePayload(existingSale, basePayload, adjustedAmount, options) {
  const existingPayments = normalizeList(existingSale?.SalePayments?.SalePayment);
  const firstExistingPayment = existingPayments[0] || {};

  const updatePayload = {
    completed: basePayload.completed || existingSale?.completed || "true",
    SalePayments: {
      SalePayment: [
        {
          amount: String(adjustedAmount),
          paymentTypeID: String(options.paymentTypeId || firstExistingPayment.paymentTypeID || "24")
        }
      ]
    }
  };

  if (basePayload.completeTime) {
    updatePayload.completeTime = basePayload.completeTime;
  }

  if (firstExistingPayment.salePaymentID) {
    updatePayload.SalePayments.SalePayment[0].salePaymentID = String(firstExistingPayment.salePaymentID);
  }

  if (firstExistingPayment.paymentID) {
    updatePayload.SalePayments.SalePayment[0].paymentID = String(firstExistingPayment.paymentID);
  }

  if (firstExistingPayment.registerID) {
    updatePayload.SalePayments.SalePayment[0].registerID = String(firstExistingPayment.registerID);
  }

  if (firstExistingPayment.employeeID) {
    updatePayload.SalePayments.SalePayment[0].employeeID = String(firstExistingPayment.employeeID);
  }

  return updatePayload;
}

function buildPostablePayload(sourceSale, options) {
  if (!sourceSale || typeof sourceSale !== "object") {
    throw new Error("Source payload did not include a valid Sale object.");
  }

  const saleAllowed = [
    "completed",
    "completeTime",
    "referenceNumber",
    "referenceNumberSource",
    "change",
    "customerID",
    "discountID",
    "employeeID",
    "registerID",
    "shipToID",
    "shopID",
    "taxCategoryID",
    "isTaxInclusive"
  ];

  const saleLineAllowed = [
    "itemID",
    "itemCode",
    "employeeID",
    "shopID",
    "unitQuantity",
    "unitPrice",
    "discountID",
    "tax",
    "lineType",
    "itemFeeID",
    "taxClassID",
    "taxCategoryID",
    "noteID",
    "note",
    "customerID",
    "parentSaleLineID"
  ];

  const salePaymentAllowed = [
    "amount",
    "paymentTypeID",
    "paymentID",
    "registerID",
    "employeeID",
  ];

  const outSale = pick(sourceSale, saleAllowed);
  const enforcedTaxClassId = String(options.taxClassId);

  const sourceLines = normalizeList(sourceSale?.SaleLines?.SaleLine);
  const outLines = sourceLines.map((line) => {
    const outLine = pick(line, saleLineAllowed);
    outLine.taxClassID = enforcedTaxClassId;
    return outLine;
  });

  if (outLines.length > 0) {
    outSale.SaleLines = { SaleLine: outLines };
  }

  const sourcePayments = normalizeList(sourceSale?.SalePayments?.SalePayment);
  const outPayments = sourcePayments.map((payment) => pick(payment, salePaymentAllowed));

  if (options.complete) {
    const paymentAmount = resolvePaymentAmount(sourceSale, options);
    outSale.completed = "true";
    if (options.keepOriginalCompleteTime) {
      const originalCompleteTime = resolveCompleteTime(sourceSale);
      if (originalCompleteTime) {
        outSale.completeTime = originalCompleteTime;
      }
    }
    outSale.SalePayments = {
      SalePayment: [
        {
          amount: String(paymentAmount),
          paymentTypeID: String(options.paymentTypeId)
        }
      ]
    };
  } else {
    if (outPayments.length > 0) {
      if (options.matchPaymentAmountToSaleTotal) {
        outPayments[0] = {
          ...outPayments[0],
          amount: resolvePaymentAmount(sourceSale, options),
          paymentTypeID: String(options.paymentTypeId || outPayments[0].paymentTypeID || "24")
        };
      }
      outSale.SalePayments = { SalePayment: outPayments };
    } else if (options.ensurePaymentObjectWhenMissing) {
      const paymentAmount = resolvePaymentAmount(sourceSale, options);
      outSale.SalePayments = {
        SalePayment: [
          {
            amount: String(paymentAmount),
            paymentTypeID: String(options.paymentTypeId || "24")
          }
        ]
      };
    }
  }

  if (!outSale.employeeID) {
    throw new Error("employeeID is required to create a sale. It was missing from source and not overridden.");
  }

  if (!outSale.shopID) {
    throw new Error("shopID is required to create a sale. It was missing from source and not overridden.");
  }

  return outSale;
}

async function lsRequest({ method, url, token, body }) {
  const headers = {
    Accept: "application/json"
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let json;

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const details = json?.error?.message || json?.message || json?.raw || text || "Unknown error";
    const requestError = new Error(`${method} ${url} failed (${response.status}): ${details}`);
    requestError.status = response.status;
    requestError.response = json;
    requestError.url = url;
    requestError.method = method;
    throw requestError;
  }

  return json;
}

function accountApiBase(baseUrl, apiPathPrefix, accountId) {
  const normalizedBase = String(baseUrl).replace(/\/$/, "");
  const normalizedPrefix = String(apiPathPrefix).replace(/\/$/, "");
  return `${normalizedBase}${normalizedPrefix}/Account/${accountId}`;
}

async function inferSaleTotalWithTaxCategory({ sourceSale, accountId, baseUrl, apiPathPrefix, token }) {
  const taxCategoryId = sourceSale?.taxCategoryID;
  if (!taxCategoryId) {
    return inferSaleTotal(sourceSale);
  }

  try {
    const taxUrl = `${accountApiBase(baseUrl, apiPathPrefix, accountId)}/TaxCategory/${taxCategoryId}.json`;
    const taxPayload = await lsRequest({
      method: "GET",
      url: taxUrl,
      token
    });
    const taxCategory = normalizeTaxCategoryPayload(taxPayload);
    if (!taxCategory) {
      return inferSaleTotal(sourceSale);
    }
    return calculateSaleTotalFromTaxCategory(sourceSale, taxCategory);
  } catch (error) {
    console.warn(`[Sale Clone] TaxCategory lookup failed, using fallback total: ${error.message}`);
    return inferSaleTotal(sourceSale);
  }
}

  async function cloneOneSale(options, saleId) {
    const accountId = options.accountId;
    const token = options.token || "";

    if (!accountId) {
      throw new Error("Missing required config.accountId");
    }

    const enforcedTaxClassId = requireTaxClassId(options);

    let sourceEnvelope = options.sourceEnvelope;
    if (!sourceEnvelope) {
      if (!saleId) {
        throw new Error("Missing required config.saleId (unless config.sourceEnvelope is provided)");
      }

      const getUrl = `${accountApiBase(options.baseUrl, options.apiPathPrefix, accountId)}/Sale/${saleId}.json?load_relations=all`;
      sourceEnvelope = await lsRequest({
        method: "GET",
        url: getUrl,
        token
      });
    }

    const sourceSale = sourceEnvelope?.Sale;
    if (!sourceSale) {
      throw new Error("Response did not include Sale object.");
    }

    const calculatedSaleTotal = options.matchPaymentAmountToSaleTotal
      ? await inferSaleTotalWithTaxCategory({
          sourceSale,
          accountId,
          baseUrl: options.baseUrl,
          apiPathPrefix: options.apiPathPrefix,
          token
        })
      : "";

    const payload = buildPostablePayload(sourceSale, {
      taxClassId: enforcedTaxClassId,
      complete: Boolean(options.complete),
      paymentTypeId: options.paymentTypeId || "24",
      paymentAmount: options.paymentAmount,
      ensurePaymentObjectWhenMissing: Boolean(options.ensurePaymentObjectWhenMissing),
      matchPaymentAmountToSaleTotal: Boolean(options.matchPaymentAmountToSaleTotal),
      keepOriginalCompleteTime: Boolean(options.keepOriginalCompleteTime),
      calculatedSaleTotal
    });

    if (options.dryRun) {
      console.log("[Sale Clone] DRY RUN payload:");
      console.log(JSON.stringify({ Sale: payload }, null, 2));
      return {
        dryRun: true,
        sourceSaleID: sourceSale.saleID || null,
        payload
      };
    }

    const postUrl = `${accountApiBase(options.baseUrl, options.apiPathPrefix, accountId)}/Sale.json`;
    let createResponse;
    let usedRetry = false;
    let retrySaleId = null;
    try {
      createResponse = await lsRequest({
        method: "POST",
        url: postUrl,
        token,
        body: payload
      });
    } catch (error) {
      const canRetryOutOfBalance =
        options.retryOutOfBalanceOnce &&
        isOutOfBalanceError(error) &&
        error?.response?.balance !== undefined &&
        hasServerCreatedSaleId(error);

      if (!canRetryOutOfBalance) {
        throw error;
      }

      const retryPayload = JSON.parse(JSON.stringify(payload));
      const adjustedAmount = applyOutOfBalanceDeltaToFirstPayment(retryPayload, error.response.balance);
      usedRetry = true;
      retrySaleId = String(error.response.saleID);
      console.warn(
        `[Sale Clone] OutOfBalanceError detected on sale ${retrySaleId}. Applied balance delta ${error.response.balance}; updating existing sale with payment amount ${adjustedAmount}.`
      );

      const existingSaleUrl = `${accountApiBase(options.baseUrl, options.apiPathPrefix, accountId)}/Sale/${retrySaleId}.json?load_relations=all`;
      const existingSaleResponse = await lsRequest({
        method: "GET",
        url: existingSaleUrl,
        token
      });
      const existingRetrySale = existingSaleResponse?.Sale;
      if (!existingRetrySale) {
        throw new Error(`Retry sale ${retrySaleId} was created but could not be reloaded for update.`);
      }

      const retryUpdatePayload = buildOutOfBalanceRetryUpdatePayload(
        existingRetrySale,
        retryPayload,
        adjustedAmount,
        options
      );

      const updateUrl = `${accountApiBase(options.baseUrl, options.apiPathPrefix, accountId)}/Sale/${retrySaleId}.json`;
      createResponse = await lsRequest({
        method: "PUT",
        url: updateUrl,
        token,
        body: retryUpdatePayload
      });
    }

    const createdSale = createResponse?.Sale;
    const result = {
      dryRun: false,
      sourceSaleID: sourceSale.saleID || saleId || null,
      createdSaleID: createdSale?.saleID || retrySaleId || null,
      paymentTypeIDUsed: options.paymentTypeId || "24",
      completed: payload.completed || "false",
      outOfBalanceRetryApplied: usedRetry
    };

    console.log("[Sale Clone] Completed:");
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  async function cloneSale(options) {
    const saleIds = parseSaleIdList(options);
    if (saleIds.length === 0) {
      throw new Error("Missing source sale IDs. Enter one or more IDs in Source Sale IDs.");
    }

    const cooldownEvery = toPositiveInteger(options.cooldownEvery, 25);
    const cooldownMs = toPositiveInteger(options.cooldownMs, 2000);

    const mapping = [];
    const failures = [];

    for (const [index, sourceSaleId] of saleIds.entries()) {
      console.log(`[Sale Clone] Processing source sale ${sourceSaleId}...`);
      try {
        const oneResult = await cloneOneSale(options, sourceSaleId);
        mapping.push({
          sourceSaleID: oneResult.sourceSaleID || sourceSaleId,
          createdSaleID: oneResult.createdSaleID || null,
          outOfBalanceRetryApplied: Boolean(oneResult.outOfBalanceRetryApplied),
          status: options.dryRun ? "dry-run" : "success"
        });
      } catch (error) {
        const errorMessage = error?.message || "Unknown error";
        failures.push({
          sourceSaleID: sourceSaleId,
          error: errorMessage
        });
        mapping.push({
          sourceSaleID: sourceSaleId,
          createdSaleID: null,
          outOfBalanceRetryApplied: false,
          status: "failed",
          error: errorMessage
        });
        console.error(`[Sale Clone] Failed for source sale ${sourceSaleId}: ${errorMessage}`);
        if (error?.response) {
          console.error("[Sale Clone] Server response:", error.response);
        }
      }

      const processedCount = index + 1;
      const shouldCooldown = cooldownEvery > 0 && cooldownMs > 0 && processedCount < saleIds.length && processedCount % cooldownEvery === 0;
      if (shouldCooldown) {
        console.log(`[Sale Clone] Cooling down for ${cooldownMs}ms after ${processedCount} sales...`);
        await sleep(cooldownMs);
      }
    }

    const batchSummary = {
      totalRequested: saleIds.length,
      succeeded: mapping.filter((x) => x.status === "success" || x.status === "dry-run").length,
      failed: failures.length,
      dryRun: Boolean(options.dryRun),
      mapping,
      failures
    };

    console.log("[Sale Clone] Batch mapping (original -> new):");
    console.table(mapping);
    console.log("[Sale Clone] Batch summary:");
    console.log(JSON.stringify(batchSummary, null, 2));

    if (options.exportBatchMappingCsv) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const csv = toBatchMappingCsv(mapping);
      downloadTextFile(`sale-clone-mapping-${timestamp}.csv`, csv, "text/csv;charset=utf-8");
      console.log("[Sale Clone] Downloaded mapping CSV.");
    }

    return batchSummary;
  }

  // Expose utility for reruns without re-pasting everything.
  window.cloneLightspeedSale = cloneSale;

  const runConfig = config.useConfigWindow ? await createConfigWindow(config) : config;
  if (!runConfig) {
    console.warn("[Sale Clone] Cancelled by user.");
    return;
  }

  cloneSale(runConfig).catch((error) => {
    console.error(`[Sale Clone] Error: ${error.message}`);
    if (error?.response) {
      console.error("[Sale Clone] Server response:", error.response);
    }
  });
})();
