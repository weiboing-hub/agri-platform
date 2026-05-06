function registerOpenApi(app) {
  app.addSchema({
    $id: "ApiEnvelope",
    type: "object",
    properties: {
      ok: { type: "boolean" },
      message: { type: "string" },
      data: {}
    }
  });

  app.addSchema({
    $id: "ApiErrorEnvelope",
    type: "object",
    properties: {
      ok: { type: "boolean", const: false },
      error: { type: "string" },
      message: { type: "string" },
      details: {}
    }
  });
}

module.exports = {
  registerOpenApi
};
