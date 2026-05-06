const { query } = require("./mysql");
const { parseInteger, optionalString, requiredString } = require("./helpers");
const { resolveCurrentTenantId } = require("./tenant-foundation");

function buildTenantScopedLookup(id, tenantId) {
  const filters = ["id = ?"];
  const params = [id];
  if (tenantId) {
    filters.push("tenant_id = ?");
    params.push(tenantId);
  } else {
    filters.push("tenant_id IS NULL");
  }
  return {
    whereClause: filters.join(" AND "),
    params
  };
}

async function getCropKnowledgeTenantId(authContext = null) {
  return resolveCurrentTenantId(authContext);
}

async function findTenantScopedSpecies(speciesId, tenantId) {
  if (!speciesId) {
    return null;
  }
  const scope = buildTenantScopedLookup(speciesId, tenantId);
  const rows = await query(
    `SELECT
       id,
       tenant_id AS tenantId,
       species_code AS speciesCode,
       species_name AS speciesName,
       category_name AS categoryName,
       scientific_name AS scientificName,
       sort_order AS sortOrder,
       status
     FROM agri_crop_species
     WHERE ${scope.whereClause}
     LIMIT 1`,
    scope.params
  );
  return rows[0] || null;
}

async function findTenantScopedVariety(varietyId, tenantId) {
  if (!varietyId) {
    return null;
  }
  const scope = buildTenantScopedLookup(varietyId, tenantId);
  const rows = await query(
    `SELECT
       id,
       tenant_id AS tenantId,
       species_id AS speciesId,
       variety_code AS varietyCode,
       variety_name AS varietyName,
       sort_order AS sortOrder,
       status
     FROM agri_crop_varieties
     WHERE ${scope.whereClause}
     LIMIT 1`,
    scope.params
  );
  return rows[0] || null;
}

async function findTenantScopedStage(stageId, tenantId) {
  if (!stageId) {
    return null;
  }
  const scope = buildTenantScopedLookup(stageId, tenantId);
  const rows = await query(
    `SELECT
       id,
       tenant_id AS tenantId,
       species_id AS speciesId,
       stage_code AS stageCode,
       stage_name AS stageName,
       stage_order AS stageOrder,
       status
     FROM agri_crop_growth_stages
     WHERE ${scope.whereClause}
     LIMIT 1`,
    scope.params
  );
  return rows[0] || null;
}

async function resolveAreaCropSelection(authContext, payload = {}) {
  const tenantId = await getCropKnowledgeTenantId(authContext);
  const cropSpeciesId = parseInteger(payload.cropSpeciesId);
  const cropVarietyId = parseInteger(payload.cropVarietyId);
  const cropStageId = parseInteger(payload.cropStageId);

  if (!cropSpeciesId && !cropVarietyId && !cropStageId) {
    return {
      tenantId,
      cropSpeciesId: null,
      cropVarietyId: null,
      cropStageId: null,
      cropType: optionalString(payload.cropType),
      growthStage: optionalString(payload.growthStage),
      cropSpeciesName: null,
      cropVarietyName: null,
      cropStageName: null
    };
  }

  if (!cropSpeciesId) {
    throw new Error("选择品种或生长阶段前，请先选择作物品类");
  }

  const species = await findTenantScopedSpecies(cropSpeciesId, tenantId);
  if (!species) {
    throw new Error("所选作物品类不存在或不属于当前租户");
  }

  let variety = null;
  if (cropVarietyId) {
    variety = await findTenantScopedVariety(cropVarietyId, tenantId);
    if (!variety) {
      throw new Error("所选作物品种不存在或不属于当前租户");
    }
    if (Number(variety.speciesId) !== Number(species.id)) {
      throw new Error("所选作物品种与作物品类不匹配");
    }
  }

  let stage = null;
  if (cropStageId) {
    stage = await findTenantScopedStage(cropStageId, tenantId);
    if (!stage) {
      throw new Error("所选生长阶段不存在或不属于当前租户");
    }
    if (Number(stage.speciesId) !== Number(species.id)) {
      throw new Error("所选生长阶段与作物品类不匹配");
    }
  }

  return {
    tenantId,
    cropSpeciesId: Number(species.id),
    cropVarietyId: variety ? Number(variety.id) : null,
    cropStageId: stage ? Number(stage.id) : null,
    cropType: species.speciesName,
    growthStage: stage?.stageName || optionalString(payload.growthStage),
    cropSpeciesName: species.speciesName,
    cropVarietyName: variety?.varietyName || null,
    cropStageName: stage?.stageName || null
  };
}

async function resolveCropTargetSelection(authContext, payload = {}) {
  const tenantId = await getCropKnowledgeTenantId(authContext);
  const speciesId = parseInteger(payload.speciesId);
  const varietyId = parseInteger(payload.varietyId);
  const stageId = parseInteger(payload.stageId);

  if (!speciesId) {
    throw new Error("speciesId不能为空");
  }
  if (!stageId) {
    throw new Error("stageId不能为空");
  }

  const species = await findTenantScopedSpecies(speciesId, tenantId);
  if (!species) {
    throw new Error("所选作物品类不存在或不属于当前租户");
  }

  const stage = await findTenantScopedStage(stageId, tenantId);
  if (!stage) {
    throw new Error("所选生长阶段不存在或不属于当前租户");
  }
  if (Number(stage.speciesId) !== Number(species.id)) {
    throw new Error("所选生长阶段与作物品类不匹配");
  }

  let variety = null;
  if (varietyId) {
    variety = await findTenantScopedVariety(varietyId, tenantId);
    if (!variety) {
      throw new Error("所选作物品种不存在或不属于当前租户");
    }
    if (Number(variety.speciesId) !== Number(species.id)) {
      throw new Error("所选作物品种与作物品类不匹配");
    }
  }

  return {
    tenantId,
    speciesId: Number(species.id),
    varietyId: variety ? Number(variety.id) : null,
    stageId: Number(stage.id),
    species,
    variety,
    stage,
    metricCode: requiredString(payload.metricCode, "metricCode")
  };
}

module.exports = {
  getCropKnowledgeTenantId,
  findTenantScopedSpecies,
  findTenantScopedVariety,
  findTenantScopedStage,
  resolveAreaCropSelection,
  resolveCropTargetSelection
};
