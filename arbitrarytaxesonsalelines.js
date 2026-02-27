(() => {
  const DEFAULT_BASE_URL = "https://us.merchantos.com";

  function toRateString(rateInput) {
    const numeric = Number(rateInput);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`Invalid tax rate: ${rateInput}`);
    }
    const rounded = Math.round((numeric + Number.EPSILON) * 1000000) / 1000000;
    return String(rounded);
  }

  function ratesEqual(a, b) {
    return Number(a) === Number(b);
  }

  function encodeQuery(queryObject) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(queryObject || {})) {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    }
    const queryString = query.toString();
    return queryString ? `?${queryString}` : "";
  }

  function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
  }

  async function lsRequest({ method, baseUrl, accountId, endpoint, body, query, accessToken }) {
    if (!accountId) {
      throw new Error("accountId is required.");
    }

    const url = `${baseUrl}/API/V3/Account/${accountId}${endpoint}${encodeQuery(query)}`;
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };

    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const details = data?.error?.message || data?.message || data?.raw || text || "Unknown API error";
      const requestError = new Error(`Lightspeed API ${method} ${endpoint} failed (${response.status}): ${details}`);
      requestError.status = response.status;
      requestError.endpoint = endpoint;
      throw requestError;
    }

    return data;
  }

  function listFromResponse(data, key) {
    const value = data?.[key];
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function normalizeSaleLines(saleLinesNode) {
    if (!saleLinesNode || !saleLinesNode.SaleLine) {
      return [];
    }

    if (Array.isArray(saleLinesNode.SaleLine)) {
      return saleLinesNode.SaleLine;
    }

    return [saleLinesNode.SaleLine];
  }

  function pickKeys(source, allowedKeys) {
    const result = {};
    for (const key of allowedKeys) {
      if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    return result;
  }

  function buildPostableSalePayload(inputPayload) {
    const saleSource = inputPayload?.Sale ? inputPayload.Sale : inputPayload;
    if (!saleSource || typeof saleSource !== "object") {
      throw new Error("salePayload must be an object with a top-level Sale object or Sale fields.");
    }

    const topLevelAllowed = [
      "completed",
      "enablePromotions",
      "completeTime",
      "referenceNumber",
      "referenceNumberSource",
      "change",
      "tipEnabled",
      "receiptPreference",
      "customerID",
      "discountID",
      "employeeID",
      "tipEmployeeID",
      "quoteID",
      "registerID",
      "shipToID",
      "shopID",
      "taxCategoryID",
      "isTaxInclusive",
      "SalePayments"
    ];

    const lineAllowed = [
      "itemID",
      "itemCode",
      "employeeID",
      "shopID",
      "unitQuantity",
      "unitPrice",
      "discountID",
      "discountAmount",
      "discountPercent",
      "tax",
      "lineType",
      "note",
      "itemFeeID",
      "taxClassID",
      "taxCategoryID",
      "taxRate1",
      "taxRate2",
      "tax1Rate",
      "tax2Rate",
      "wantedTaxAmount",
      "wantedTax1Amount",
      "wantedTax2Amount",
      "taxableBase"
    ];

    const sale = pickKeys(saleSource, topLevelAllowed);
    const sourceLines = normalizeSaleLines(saleSource.SaleLines);
    const reducedLines = sourceLines.map((line) => pickKeys(line, lineAllowed));

    if (reducedLines.length > 0) {
      sale.SaleLines = { SaleLine: reducedLines };
    }

    return sale;
  }

  async function getTaxCategoryByID(ctx, taxCategoryID) {
    const response = await lsRequest({
      ...ctx,
      method: "GET",
      endpoint: `/TaxCategory/${taxCategoryID}.json`
    });
    return response?.TaxCategory;
  }

  async function findTaxCategoryByRates(ctx, taxRate1, taxRate2) {
    const response = await lsRequest({
      ...ctx,
      method: "GET",
      endpoint: "/TaxCategory.json"
    });

    const categories = listFromResponse(response, "TaxCategory");
    return categories.find((category) => (
      ratesEqual(category.tax1Rate ?? "0", taxRate1) &&
      ratesEqual(category.tax2Rate ?? "0", taxRate2)
    ));
  }

  async function createTaxCategoryForRates(ctx, baseTaxCategory, taxRate1, taxRate2) {
    const payload = {
      isTaxInclusive: String(baseTaxCategory?.isTaxInclusive ?? "false"),
      tax1Name: baseTaxCategory?.tax1Name || "Tax 1",
      tax2Name: baseTaxCategory?.tax2Name || "Tax 2",
      tax1Rate: String(taxRate1),
      tax2Rate: String(taxRate2)
    };

    const created = await lsRequest({
      ...ctx,
      method: "POST",
      endpoint: "/TaxCategory.json",
      body: payload
    });

    return created?.TaxCategory;
  }

  async function getOrCreateTaxCategoryForRates(ctx, baseTaxCategoryID, taxRate1, taxRate2) {
    const baseCategory = await getTaxCategoryByID(ctx, baseTaxCategoryID);
    if (!baseCategory?.taxCategoryID) {
      throw new Error(`Base tax category ${baseTaxCategoryID} was not found.`);
    }

    if (ratesEqual(baseCategory.tax1Rate ?? "0", taxRate1) && ratesEqual(baseCategory.tax2Rate ?? "0", taxRate2)) {
      return {
        taxCategoryID: String(baseCategory.taxCategoryID),
        createdTaxCategory: false
      };
    }

    const existingCategory = await findTaxCategoryByRates(ctx, taxRate1, taxRate2);
    if (existingCategory?.taxCategoryID) {
      return {
        taxCategoryID: String(existingCategory.taxCategoryID),
        createdTaxCategory: false
      };
    }

    const createdCategory = await createTaxCategoryForRates(ctx, baseCategory, taxRate1, taxRate2);
    if (!createdCategory?.taxCategoryID) {
      throw new Error("Failed to create tax category for requested rates.");
    }

    return {
      taxCategoryID: String(createdCategory.taxCategoryID),
      createdTaxCategory: true
    };
  }

  function applyTaxToSalePayload(salePayload, taxCategoryID) {
    const sale = salePayload;
    const fallbackTaxCategoryID = String(taxCategoryID);

    const saleLines = normalizeSaleLines(sale.SaleLines);
    let firstLineCategoryID = "";

    for (const line of saleLines) {
      if (line.taxCategoryID === undefined || line.taxCategoryID === null || line.taxCategoryID === "") {
        line.taxCategoryID = fallbackTaxCategoryID;
      } else {
        line.taxCategoryID = String(line.taxCategoryID);
      }

      if (!firstLineCategoryID) {
        firstLineCategoryID = line.taxCategoryID;
      }

      if (line.tax === undefined) {
        line.tax = "true";
      }
    }

    sale.taxCategoryID = firstLineCategoryID || fallbackTaxCategoryID;

    return sale;
  }

  function toCurrencyNumber(value, defaultValue = 0) {
    const candidate = value === undefined || value === null || value === "" ? defaultValue : Number(value);
    if (!Number.isFinite(candidate)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    return candidate;
  }

  function roundCurrency(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function computeLineTaxableBase(line) {
    const explicitBase = line.taxableBase;
    if (explicitBase !== undefined && explicitBase !== null && explicitBase !== "") {
      const value = toCurrencyNumber(explicitBase);
      if (value <= 0) {
        throw new Error(`taxableBase must be greater than 0. Received ${explicitBase}`);
      }
      return value;
    }

    const quantity = toCurrencyNumber(line.unitQuantity, 1);
    const unitPrice = toCurrencyNumber(line.unitPrice, 0);
    const gross = quantity * unitPrice;

    const discountAmount = toCurrencyNumber(line.discountAmount, 0);
    const discountPercent = toCurrencyNumber(line.discountPercent, 0);
    const percentDiscountValue = gross * discountPercent;
    const taxableBase = gross - discountAmount - percentDiscountValue;

    if (taxableBase <= 0) {
      throw new Error("Unable to compute positive taxable base for line. Provide taxableBase explicitly.");
    }

    return taxableBase;
  }

  function computeLineTaxAmounts(line, taxMode, defaultRate1, defaultRate2) {
    if (taxMode === "amounts") {
      return {
        tax1: roundCurrency(toCurrencyNumber(line.wantedTax1Amount ?? line.wantedTaxAmount, 0)),
        tax2: roundCurrency(toCurrencyNumber(line.wantedTax2Amount, 0))
      };
    }

    const { rate1, rate2 } = getLineRequestedRates(line, defaultRate1, defaultRate2, "rates");
    const taxableBase = computeLineTaxableBase(line);
    return {
      tax1: roundCurrency(taxableBase * toCurrencyNumber(rate1)),
      tax2: roundCurrency(taxableBase * toCurrencyNumber(rate2))
    };
  }

  function estimateSaleTotal(salePayload, taxMode, defaultRate1, defaultRate2) {
    const saleLines = normalizeSaleLines(salePayload.SaleLines);

    let total = 0;
    for (const line of saleLines) {
      const quantity = toCurrencyNumber(line.unitQuantity, 1);
      const unitPrice = toCurrencyNumber(line.unitPrice, 0);
      const gross = quantity * unitPrice;
      const discountAmount = toCurrencyNumber(line.discountAmount, 0);
      const discountPercent = toCurrencyNumber(line.discountPercent, 0);
      const lineSubtotal = gross - discountAmount - (gross * discountPercent);
      const taxes = computeLineTaxAmounts(line, taxMode, defaultRate1, defaultRate2);
      total += lineSubtotal + taxes.tax1 + taxes.tax2;
    }

    return roundCurrency(total).toFixed(2);
  }

  function getLineRequestedRates(line, defaultRate1, defaultRate2, taxMode) {
    if (taxMode === "amounts") {
      const amount1Raw = line.wantedTax1Amount ?? line.wantedTaxAmount ?? 0;
      const amount2Raw = line.wantedTax2Amount ?? 0;
      const amount1 = toCurrencyNumber(amount1Raw, 0);
      const amount2 = toCurrencyNumber(amount2Raw, 0);
      const taxableBase = computeLineTaxableBase(line);

      return {
        rate1: toRateString(amount1 / taxableBase),
        rate2: toRateString(amount2 / taxableBase)
      };
    }

    const lineRate1Raw =
      line.taxRate1 ??
      line.tax1Rate ??
      defaultRate1;

    const lineRate2Raw =
      line.taxRate2 ??
      line.tax2Rate ??
      defaultRate2;

    return {
      rate1: toRateString(lineRate1Raw),
      rate2: toRateString(lineRate2Raw)
    };
  }

  function stripLineRateFields(line) {
    delete line.taxRate1;
    delete line.taxRate2;
    delete line.tax1Rate;
    delete line.tax2Rate;
    delete line.wantedTaxAmount;
    delete line.wantedTax1Amount;
    delete line.wantedTax2Amount;
    delete line.taxableBase;
  }

  function applyCashCompletionIfRequested(salePayload, options) {
    const { autoCompleteWithCashPayment, taxMode, defaultRate1, defaultRate2 } = options;
    if (!autoCompleteWithCashPayment) {
      return salePayload;
    }

    const amount = estimateSaleTotal(salePayload, taxMode, defaultRate1, defaultRate2);
    salePayload.completed = "true";
    salePayload.SalePayments = {
      SalePayment: [
        {
          amount,
          paymentTypeID: "1"
        }
      ]
    };

    return salePayload;
  }

  async function applyPerLineTaxCategories(
    ctx,
    salePayload,
    baseTaxCategoryID,
    defaultRate1,
    defaultRate2,
    taxMode
  ) {
    const sale = salePayload;
    const saleLines = normalizeSaleLines(sale.SaleLines);
    const categoryCache = new Map();
    const lineMappings = [];
    let firstLineCategoryID = "";

    for (let index = 0; index < saleLines.length; index += 1) {
      const line = saleLines[index];
      const { rate1, rate2 } = getLineRequestedRates(line, defaultRate1, defaultRate2, taxMode);
      const cacheKey = `${rate1}|${rate2}`;

      let resolution = categoryCache.get(cacheKey);
      if (!resolution) {
        resolution = await getOrCreateTaxCategoryForRates(
          ctx,
          baseTaxCategoryID,
          rate1,
          rate2
        );
        categoryCache.set(cacheKey, resolution);
      }

      line.taxCategoryID = String(resolution.taxCategoryID);
      if (line.tax === undefined) {
        line.tax = "true";
      }
      stripLineRateFields(line);

      if (!firstLineCategoryID) {
        firstLineCategoryID = line.taxCategoryID;
      }

      lineMappings.push({
        lineIndex: index,
        taxCategoryID: line.taxCategoryID,
        taxRate1: rate1,
        taxRate2: rate2,
        createdTaxCategory: Boolean(resolution.createdTaxCategory)
      });
    }

    sale.taxCategoryID = firstLineCategoryID || String(baseTaxCategoryID);

    return {
      sale,
      lineMappings
    };
  }

  async function postSale(ctx, saleObject) {
    const response = await lsRequest({
      ...ctx,
      method: "POST",
      endpoint: "/Sale.json",
      body: saleObject
    });

    return response?.Sale;
  }

  async function resolveTaxCategoryID(ctx, explicitTaxCategoryID, postableSale, originalPayload) {
    if (explicitTaxCategoryID !== undefined && explicitTaxCategoryID !== null && explicitTaxCategoryID !== "") {
      return String(explicitTaxCategoryID);
    }

    const payloadSale = originalPayload?.Sale ? originalPayload.Sale : originalPayload;
    const payloadTaxCategoryID =
      postableSale?.taxCategoryID ||
      payloadSale?.taxCategoryID;

    if (payloadTaxCategoryID !== undefined && payloadTaxCategoryID !== null && payloadTaxCategoryID !== "") {
      return String(payloadTaxCategoryID);
    }

    const shopID = postableSale?.shopID || payloadSale?.shopID;
    if (shopID !== undefined && shopID !== null && shopID !== "") {
      const shopResponse = await lsRequest({
        ...ctx,
        method: "GET",
        endpoint: `/Shop/${shopID}.json`
      });

      const shopTaxCategoryID = shopResponse?.Shop?.taxCategoryID;
      if (shopTaxCategoryID !== undefined && shopTaxCategoryID !== null && shopTaxCategoryID !== "") {
        return String(shopTaxCategoryID);
      }
    }

    throw new Error("Unable to resolve taxCategoryID. Provide taxCategoryID or include it in salePayload (or provide shopID with a shop tax category).");
  }

  async function runTaxSaleFromSession(config) {
    const {
      accountId,
      taxRate1 = 0,
      taxRate2 = 0,
      taxMode = "rates",
      taxCategoryID,
      salePayload,
      baseUrl = DEFAULT_BASE_URL,
      accessToken,
      sanitizePayload = true,
      autoCompleteWithCashPayment = false
    } = config || {};

    if (!salePayload) {
      throw new Error("salePayload is required.");
    }

    const defaultRate1 = toRateString(taxRate1);
    const defaultRate2 = toRateString(taxRate2);

    const ctx = {
      baseUrl,
      accountId: String(accountId),
      accessToken
    };

    const postableSale = sanitizePayload
      ? buildPostableSalePayload(salePayload)
      : (salePayload?.Sale ? salePayload.Sale : salePayload);

    const categoryId = await resolveTaxCategoryID(ctx, taxCategoryID, postableSale, salePayload);

    const taxApplied = await applyPerLineTaxCategories(
      ctx,
      postableSale,
      categoryId,
      defaultRate1,
      defaultRate2,
      taxMode
    );

    const saleForPost = taxApplied.sale;

    applyCashCompletionIfRequested(saleForPost, {
      autoCompleteWithCashPayment,
      taxMode,
      defaultRate1,
      defaultRate2
    });

    const createdSale = await postSale(ctx, saleForPost);

    const createdAnyTaxCategory = taxApplied.lineMappings.some((line) => line.createdTaxCategory);

    return {
      status: "ok",
      baseUrl,
      accountId: String(accountId),
      baseTaxCategoryID: categoryId,
      taxCategoryID: saleForPost.taxCategoryID,
      taxMode,
      autoCompleteWithCashPayment: Boolean(autoCompleteWithCashPayment),
      cashPaymentTypeID: "1",
      defaultTaxRate1: defaultRate1,
      defaultTaxRate2: defaultRate2,
      saleID: createdSale?.saleID,
      ticketNumber: createdSale?.ticketNumber,
      createdTaxCategory: createdAnyTaxCategory,
      lineTaxMappings: taxApplied.lineMappings
    };
  }

  window.runTaxSaleFromSession = runTaxSaleFromSession;

  const SAMPLE_PERCENT_BASED_PAYLOAD = {
    Sale: {
      completed: "false",
      employeeID: "1",
      registerID: "1",
      shopID: "1",
      SaleLines: {
        SaleLine: [
          {
            itemID: "1",
            employeeID: "1",
            shopID: "1",
            unitQuantity: "1",
            unitPrice: "10",
            tax: "true",
            taxRate1: 0.05,
            taxRate2: 0
          },
          {
            itemID: "2",
            employeeID: "1",
            shopID: "1",
            unitQuantity: "1",
            unitPrice: "20",
            tax: "true",
            taxRate1: 0.13,
            taxRate2: 0
          }
        ]
      }
    }
  };

  const SAMPLE_VALUE_BASED_PAYLOAD = {
    Sale: {
      completed: "false",
      employeeID: "1",
      registerID: "1",
      shopID: "1",
      SaleLines: {
        SaleLine: [
          {
            itemID: "1",
            employeeID: "1",
            shopID: "1",
            unitQuantity: "1",
            unitPrice: "10",
            tax: "true",
            wantedTaxAmount: 0.5
          },
          {
            itemID: "2",
            employeeID: "1",
            shopID: "1",
            unitQuantity: "1",
            unitPrice: "20",
            tax: "true",
            wantedTaxAmount: 2.6
          }
        ]
      }
    }
  };

  window.SAMPLE_PERCENT_BASED_PAYLOAD = SAMPLE_PERCENT_BASED_PAYLOAD;
  window.SAMPLE_VALUE_BASED_PAYLOAD = SAMPLE_VALUE_BASED_PAYLOAD;

  console.log("runTaxSaleFromSession is ready.");
  console.log("Percent-based multi-line payload is available as SAMPLE_PERCENT_BASED_PAYLOAD");
  console.log("Value-based multi-line payload is available as SAMPLE_VALUE_BASED_PAYLOAD");
  console.log("Percent mode example:");
  console.log(`runTaxSaleFromSession({\n  accountId: \"YOUR_ACCOUNT_ID\",\n  taxMode: \"rates\",\n  autoCompleteWithCashPayment: true,\n  salePayload: SAMPLE_PERCENT_BASED_PAYLOAD\n}).then(console.log).catch(console.error);`);
  console.log("Value mode example:");
  console.log(`runTaxSaleFromSession({\n  accountId: \"YOUR_ACCOUNT_ID\",\n  taxMode: \"amounts\",\n  autoCompleteWithCashPayment: true,\n  salePayload: SAMPLE_VALUE_BASED_PAYLOAD\n}).then(console.log).catch(console.error);`);
})();
