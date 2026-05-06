const { query } = require("../lib/mysql");
const { ok, fail } = require("../lib/response");
const { parseInteger, requiredString, optionalString, normalizeEnabled } = require("../lib/helpers");
const { logOperation } = require("../lib/audit");
const { appendAreaScope, appendTenantScope } = require("../lib/data-scope");
const { resolveAreaWeather } = require("../lib/weather-provider");
const {
  getCropKnowledgeTenantId,
  findTenantScopedSpecies,
  findTenantScopedVariety,
  findTenantScopedStage,
  resolveCropTargetSelection
} = require("../lib/crop-knowledge");

async function cropRoutes(app) {
  app.get(
    "/api/v1/crop-knowledge/area-options",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth, "a.tenant_id");
      appendAreaScope(filters, params, request.auth, "a.id");

      const rows = await query(
        `SELECT
           a.id,
           a.area_code AS areaCode,
           a.area_name AS areaName,
           a.crop_type AS cropType,
           a.growth_stage AS growthStage,
	             a.crop_species_id AS cropSpeciesId,
	             a.crop_variety_id AS cropVarietyId,
	             a.crop_stage_id AS cropStageId,
	             a.weather_location_name AS weatherLocationName,
	             a.weather_provider_ref AS weatherProviderRef,
	             a.latitude,
	             a.longitude,
	             a.updated_at AS updatedAt,
	             s.species_name AS cropSpeciesName,
	             v.variety_name AS cropVarietyName,
           g.stage_name AS cropStageName,
           a.status
         FROM biz_areas a
         LEFT JOIN agri_crop_species s ON s.id = a.crop_species_id
         LEFT JOIN agri_crop_varieties v ON v.id = a.crop_variety_id
         LEFT JOIN agri_crop_growth_stages g ON g.id = a.crop_stage_id
         ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
         ORDER BY a.area_name ASC, a.id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.get(
    "/api/v1/crop-knowledge/options",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const speciesId = parseInteger(request.query?.speciesId);

      const speciesFilters = ["status = 'enabled'"];
      const speciesParams = [];
      appendTenantScope(speciesFilters, speciesParams, request.auth);

      const varietyFilters = ["v.status = 'enabled'"];
      const varietyParams = [];
      appendTenantScope(varietyFilters, varietyParams, request.auth, "v.tenant_id");
      if (speciesId) {
        varietyFilters.push("v.species_id = ?");
        varietyParams.push(speciesId);
      }

      const stageFilters = ["g.status = 'enabled'"];
      const stageParams = [];
      appendTenantScope(stageFilters, stageParams, request.auth, "g.tenant_id");
      if (speciesId) {
        stageFilters.push("g.species_id = ?");
        stageParams.push(speciesId);
      }

      const [species, varieties, stages] = await Promise.all([
        query(
          `SELECT
             id,
             species_code AS speciesCode,
             species_name AS speciesName,
             category_name AS categoryName,
             scientific_name AS scientificName,
             status
           FROM agri_crop_species
           WHERE ${speciesFilters.join(" AND ")}
           ORDER BY sort_order ASC, id ASC`,
          speciesParams
        ),
        query(
          `SELECT
             v.id,
             v.species_id AS speciesId,
             v.variety_code AS varietyCode,
             v.variety_name AS varietyName,
             v.status
           FROM agri_crop_varieties v
           WHERE ${varietyFilters.join(" AND ")}
           ORDER BY v.sort_order ASC, v.id ASC`,
          varietyParams
        ),
        query(
          `SELECT
             g.id,
             g.species_id AS speciesId,
             g.stage_code AS stageCode,
             g.stage_name AS stageName,
             g.stage_order AS stageOrder,
             g.status
           FROM agri_crop_growth_stages g
           WHERE ${stageFilters.join(" AND ")}
           ORDER BY g.species_id ASC, g.stage_order ASC, g.id ASC`,
          stageParams
        )
      ]);

      return ok({
        species,
        varieties,
        stages
      });
    }
  );

  app.get(
    "/api/v1/crop-knowledge/species",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const keyword = String(request.query?.keyword || "").trim();
      const filters = [];
      const params = [];

      if (keyword) {
        filters.push("(s.species_code LIKE ? OR s.species_name LIKE ? OR s.category_name LIKE ?)");
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      appendTenantScope(filters, params, request.auth, "s.tenant_id");

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           s.id,
           s.species_code AS speciesCode,
           s.species_name AS speciesName,
           s.category_name AS categoryName,
           s.scientific_name AS scientificName,
           s.sort_order AS sortOrder,
           s.status,
           s.remark,
           s.created_at AS createdAt,
           s.updated_at AS updatedAt,
           COUNT(DISTINCT v.id) AS varietyCount,
           COUNT(DISTINCT g.id) AS stageCount,
           COUNT(DISTINCT p.id) AS targetCount
         FROM agri_crop_species s
         LEFT JOIN agri_crop_varieties v ON v.species_id = s.id
         LEFT JOIN agri_crop_growth_stages g ON g.species_id = s.id
         LEFT JOIN agri_crop_target_profiles p ON p.species_id = s.id
         ${whereClause}
         GROUP BY
           s.id, s.species_code, s.species_name, s.category_name, s.scientific_name,
           s.sort_order, s.status, s.remark, s.created_at, s.updated_at
         ORDER BY s.sort_order ASC, s.id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/crop-knowledge/species",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const tenantId = await getCropKnowledgeTenantId(request.auth);
        const speciesCode = requiredString(request.body?.speciesCode, "speciesCode").toLowerCase();
        const speciesName = requiredString(request.body?.speciesName, "speciesName");
        const result = await query(
          `INSERT INTO agri_crop_species
            (tenant_id, species_code, species_name, category_name, scientific_name, sort_order, status, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            speciesCode,
            speciesName,
            optionalString(request.body?.categoryName),
            optionalString(request.body?.scientificName),
            parseInteger(request.body?.sortOrder, 100),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled",
            optionalString(request.body?.remark)
          ]
        );

        await logOperation(request, {
          moduleCode: "crop_species",
          operationType: "create",
          targetType: "agri_crop_species",
          targetId: result.insertId,
          requestParams: {
            speciesCode,
            speciesName
          },
          resultMessage: "创建作物品类"
        });

        return ok({ insertId: result.insertId, speciesCode }, "作物品类创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/crop-knowledge/species/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const speciesId = parseInteger(request.params.id);
        const tenantId = await getCropKnowledgeTenantId(request.auth);
        if (!speciesId) {
          return fail(reply, 400, "无效的作物品类ID");
        }

        const result = await query(
          `UPDATE agri_crop_species
           SET species_name = ?, category_name = ?, scientific_name = ?, sort_order = ?, status = ?, remark = ?
           WHERE id = ?
             AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
          [
            requiredString(request.body?.speciesName, "speciesName"),
            optionalString(request.body?.categoryName),
            optionalString(request.body?.scientificName),
            parseInteger(request.body?.sortOrder, 100),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled",
            optionalString(request.body?.remark),
            speciesId,
            ...(tenantId ? [tenantId] : [])
          ]
        );
        if (result.affectedRows === 0) {
          return fail(reply, 404, "未找到作物品类", "not_found");
        }

        await logOperation(request, {
          moduleCode: "crop_species",
          operationType: "update",
          targetType: "agri_crop_species",
          targetId: speciesId,
          requestParams: {
            speciesName: request.body?.speciesName
          },
          resultMessage: "更新作物品类"
        });

        return ok({ id: speciesId }, "作物品类更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.delete(
    "/api/v1/crop-knowledge/species/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      const speciesId = parseInteger(request.params.id);
      const tenantId = await getCropKnowledgeTenantId(request.auth);
      if (!speciesId) {
        return fail(reply, 400, "无效的作物品类ID");
      }

      const rows = await query(
        `SELECT id, species_code AS speciesCode, species_name AS speciesName
         FROM agri_crop_species
         WHERE id = ?
           AND tenant_id ${tenantId ? "= ?" : "IS NULL"}
         LIMIT 1`,
        [speciesId, ...(tenantId ? [tenantId] : [])]
      );
      const species = rows[0];
      if (!species) {
        return fail(reply, 404, "未找到作物品类", "not_found");
      }

      const [dependency] = await query(
        `SELECT
           (SELECT COUNT(*) FROM agri_crop_varieties WHERE species_id = ?) AS varietyCount,
           (SELECT COUNT(*) FROM agri_crop_growth_stages WHERE species_id = ?) AS stageCount,
           (SELECT COUNT(*) FROM agri_crop_target_profiles WHERE species_id = ?) AS targetCount,
           (SELECT COUNT(*) FROM biz_areas WHERE crop_species_id = ?) AS areaCount`,
        [speciesId, speciesId, speciesId, speciesId]
      );

      if (
        Number(dependency?.varietyCount || 0) > 0
        || Number(dependency?.stageCount || 0) > 0
        || Number(dependency?.targetCount || 0) > 0
        || Number(dependency?.areaCount || 0) > 0
      ) {
        return fail(reply, 409, "当前作物品类仍有关联数据，不能删除", "conflict", dependency);
      }

      await query(
        `DELETE FROM agri_crop_species
         WHERE id = ?
           AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
        [speciesId, ...(tenantId ? [tenantId] : [])]
      );
      await logOperation(request, {
        moduleCode: "crop_species",
        operationType: "delete",
        targetType: "agri_crop_species",
        targetId: speciesId,
        requestParams: {
          speciesCode: species.speciesCode,
          speciesName: species.speciesName
        },
        resultMessage: "删除作物品类"
      });

      return ok({ id: speciesId }, "作物品类删除成功");
    }
  );

  app.get(
    "/api/v1/crop-knowledge/varieties",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const speciesId = parseInteger(request.query?.speciesId);
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth, "v.tenant_id");
      if (speciesId) {
        filters.push("v.species_id = ?");
        params.push(speciesId);
      }
      const rows = await query(
        `SELECT
           v.id,
           v.species_id AS speciesId,
           v.variety_code AS varietyCode,
           v.variety_name AS varietyName,
           v.sort_order AS sortOrder,
           v.status,
           v.remark,
           s.species_name AS speciesName
         FROM agri_crop_varieties v
         INNER JOIN agri_crop_species s ON s.id = v.species_id
         ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
         ORDER BY s.sort_order ASC, v.sort_order ASC, v.id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/crop-knowledge/varieties",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const tenantId = await getCropKnowledgeTenantId(request.auth);
        const speciesId = parseInteger(request.body?.speciesId);
        const species = await findTenantScopedSpecies(speciesId, tenantId);
        if (!species) {
          return fail(reply, 400, "所选作物品类不存在或不属于当前租户");
        }
        const varietyCode = requiredString(request.body?.varietyCode, "varietyCode").toLowerCase();
        const varietyName = requiredString(request.body?.varietyName, "varietyName");

        const result = await query(
          `INSERT INTO agri_crop_varieties
            (tenant_id, species_id, variety_code, variety_name, sort_order, status, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            speciesId,
            varietyCode,
            varietyName,
            parseInteger(request.body?.sortOrder, 100),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled",
            optionalString(request.body?.remark)
          ]
        );

        await logOperation(request, {
          moduleCode: "crop_variety",
          operationType: "create",
          targetType: "agri_crop_varieties",
          targetId: result.insertId,
          requestParams: {
            speciesId,
            varietyCode,
            varietyName
          },
          resultMessage: "创建作物品种"
        });

        return ok({ insertId: result.insertId, varietyCode }, "作物品种创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/crop-knowledge/varieties/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const varietyId = parseInteger(request.params.id);
        const tenantId = await getCropKnowledgeTenantId(request.auth);
        if (!varietyId) {
          return fail(reply, 400, "无效的品种ID");
        }
        const speciesId = parseInteger(request.body?.speciesId);
        const species = await findTenantScopedSpecies(speciesId, tenantId);
        if (!species) {
          return fail(reply, 400, "所选作物品类不存在或不属于当前租户");
        }

        const result = await query(
          `UPDATE agri_crop_varieties
           SET species_id = ?, variety_name = ?, sort_order = ?, status = ?, remark = ?
           WHERE id = ?
             AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
          [
            speciesId,
            requiredString(request.body?.varietyName, "varietyName"),
            parseInteger(request.body?.sortOrder, 100),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled",
            optionalString(request.body?.remark),
            varietyId,
            ...(tenantId ? [tenantId] : [])
          ]
        );
        if (result.affectedRows === 0) {
          return fail(reply, 404, "未找到作物品种", "not_found");
        }

        await logOperation(request, {
          moduleCode: "crop_variety",
          operationType: "update",
          targetType: "agri_crop_varieties",
          targetId: varietyId,
          requestParams: {
            speciesId: request.body?.speciesId,
            varietyName: request.body?.varietyName
          },
          resultMessage: "更新作物品种"
        });

        return ok({ id: varietyId }, "作物品种更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.delete(
    "/api/v1/crop-knowledge/varieties/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      const varietyId = parseInteger(request.params.id);
      const tenantId = await getCropKnowledgeTenantId(request.auth);
      if (!varietyId) {
        return fail(reply, 400, "无效的品种ID");
      }

      const [dependency] = await query(
        `SELECT
           (SELECT COUNT(*) FROM agri_crop_target_profiles WHERE variety_id = ?) AS targetCount,
           (SELECT COUNT(*) FROM biz_areas WHERE crop_variety_id = ?) AS areaCount`,
        [varietyId, varietyId]
      );

      if (Number(dependency?.targetCount || 0) > 0 || Number(dependency?.areaCount || 0) > 0) {
        return fail(reply, 409, "当前作物品种仍有关联数据，不能删除", "conflict", dependency);
      }

      await query(
        `DELETE FROM agri_crop_varieties
         WHERE id = ?
           AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
        [varietyId, ...(tenantId ? [tenantId] : [])]
      );
      return ok({ id: varietyId }, "作物品种删除成功");
    }
  );

  app.get(
    "/api/v1/crop-knowledge/stages",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const speciesId = parseInteger(request.query?.speciesId);
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth, "g.tenant_id");
      if (speciesId) {
        filters.push("g.species_id = ?");
        params.push(speciesId);
      }
      const rows = await query(
        `SELECT
           g.id,
           g.species_id AS speciesId,
           g.stage_code AS stageCode,
           g.stage_name AS stageName,
           g.stage_order AS stageOrder,
           g.status,
           g.remark,
           s.species_name AS speciesName
         FROM agri_crop_growth_stages g
         INNER JOIN agri_crop_species s ON s.id = g.species_id
         ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
         ORDER BY s.sort_order ASC, g.stage_order ASC, g.id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/crop-knowledge/stages",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const tenantId = await getCropKnowledgeTenantId(request.auth);
        const speciesId = parseInteger(request.body?.speciesId);
        const species = await findTenantScopedSpecies(speciesId, tenantId);
        if (!species) {
          return fail(reply, 400, "所选作物品类不存在或不属于当前租户");
        }
        const stageCode = requiredString(request.body?.stageCode, "stageCode").toLowerCase();
        const stageName = requiredString(request.body?.stageName, "stageName");

        const result = await query(
          `INSERT INTO agri_crop_growth_stages
            (tenant_id, species_id, stage_code, stage_name, stage_order, status, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            speciesId,
            stageCode,
            stageName,
            parseInteger(request.body?.stageOrder, 10),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled",
            optionalString(request.body?.remark)
          ]
        );

        await logOperation(request, {
          moduleCode: "crop_stage",
          operationType: "create",
          targetType: "agri_crop_growth_stages",
          targetId: result.insertId,
          requestParams: {
            speciesId,
            stageCode,
            stageName
          },
          resultMessage: "创建生长阶段"
        });

        return ok({ insertId: result.insertId, stageCode }, "生长阶段创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/crop-knowledge/stages/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const stageId = parseInteger(request.params.id);
        const tenantId = await getCropKnowledgeTenantId(request.auth);
        if (!stageId) {
          return fail(reply, 400, "无效的生长阶段ID");
        }
        const speciesId = parseInteger(request.body?.speciesId);
        const species = await findTenantScopedSpecies(speciesId, tenantId);
        if (!species) {
          return fail(reply, 400, "所选作物品类不存在或不属于当前租户");
        }

        const result = await query(
          `UPDATE agri_crop_growth_stages
           SET species_id = ?, stage_name = ?, stage_order = ?, status = ?, remark = ?
           WHERE id = ?
             AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
          [
            speciesId,
            requiredString(request.body?.stageName, "stageName"),
            parseInteger(request.body?.stageOrder, 10),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled",
            optionalString(request.body?.remark),
            stageId,
            ...(tenantId ? [tenantId] : [])
          ]
        );
        if (result.affectedRows === 0) {
          return fail(reply, 404, "未找到生长阶段", "not_found");
        }

        await logOperation(request, {
          moduleCode: "crop_stage",
          operationType: "update",
          targetType: "agri_crop_growth_stages",
          targetId: stageId,
          requestParams: {
            speciesId: request.body?.speciesId,
            stageName: request.body?.stageName
          },
          resultMessage: "更新生长阶段"
        });

        return ok({ id: stageId }, "生长阶段更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.delete(
    "/api/v1/crop-knowledge/stages/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      const stageId = parseInteger(request.params.id);
      const tenantId = await getCropKnowledgeTenantId(request.auth);
      if (!stageId) {
        return fail(reply, 400, "无效的生长阶段ID");
      }

      const [dependency] = await query(
        `SELECT
           (SELECT COUNT(*) FROM agri_crop_target_profiles WHERE stage_id = ?) AS targetCount,
           (SELECT COUNT(*) FROM biz_areas WHERE crop_stage_id = ?) AS areaCount`,
        [stageId, stageId]
      );

      if (Number(dependency?.targetCount || 0) > 0 || Number(dependency?.areaCount || 0) > 0) {
        return fail(reply, 409, "当前生长阶段仍有关联数据，不能删除", "conflict", dependency);
      }

      await query(
        `DELETE FROM agri_crop_growth_stages
         WHERE id = ?
           AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
        [stageId, ...(tenantId ? [tenantId] : [])]
      );
      return ok({ id: stageId }, "生长阶段删除成功");
    }
  );

  app.get(
    "/api/v1/crop-knowledge/targets",
    {
      preHandler: [app.authenticate]
    },
    async (request) => {
      const speciesId = parseInteger(request.query?.speciesId);
      const stageId = parseInteger(request.query?.stageId);
      const filters = [];
      const params = [];
      appendTenantScope(filters, params, request.auth, "p.tenant_id");

      if (speciesId) {
        filters.push("p.species_id = ?");
        params.push(speciesId);
      }
      if (stageId) {
        filters.push("p.stage_id = ?");
        params.push(stageId);
      }

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await query(
        `SELECT
           p.id,
           p.species_id AS speciesId,
           p.variety_id AS varietyId,
           p.stage_id AS stageId,
           p.metric_code AS metricCode,
           p.target_min AS targetMin,
           p.target_max AS targetMax,
           p.optimal_value AS optimalValue,
           p.tolerance_text AS toleranceText,
           p.advisory_text AS advisoryText,
           p.source_name AS sourceName,
           p.sort_order AS sortOrder,
           p.status,
           s.species_name AS speciesName,
           v.variety_name AS varietyName,
           g.stage_name AS stageName,
           m.metric_name AS metricName,
           m.unit_name AS unitName
         FROM agri_crop_target_profiles p
         INNER JOIN agri_crop_species s ON s.id = p.species_id
         LEFT JOIN agri_crop_varieties v ON v.id = p.variety_id
         INNER JOIN agri_crop_growth_stages g ON g.id = p.stage_id
         LEFT JOIN iot_metric_defs m ON m.metric_code = p.metric_code
         ${whereClause}
         ORDER BY s.sort_order ASC, g.stage_order ASC, p.sort_order ASC, p.id ASC`,
        params
      );

      return ok(rows);
    }
  );

  app.post(
    "/api/v1/crop-knowledge/targets",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const selection = await resolveCropTargetSelection(request.auth, request.body);
        const result = await query(
          `INSERT INTO agri_crop_target_profiles
            (tenant_id, species_id, variety_id, stage_id, metric_code, target_min, target_max, optimal_value,
             tolerance_text, advisory_text, source_name, sort_order, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            selection.tenantId,
            selection.speciesId,
            selection.varietyId,
            selection.stageId,
            selection.metricCode,
            toNullableNumber(request.body?.targetMin),
            toNullableNumber(request.body?.targetMax),
            toNullableNumber(request.body?.optimalValue),
            optionalString(request.body?.toleranceText),
            optionalString(request.body?.advisoryText),
            optionalString(request.body?.sourceName),
            parseInteger(request.body?.sortOrder, 100),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled"
          ]
        );

        await logOperation(request, {
          moduleCode: "crop_target",
          operationType: "create",
          targetType: "agri_crop_target_profiles",
          targetId: result.insertId,
          requestParams: {
            speciesId: request.body?.speciesId,
            varietyId: request.body?.varietyId,
            stageId: request.body?.stageId,
            metricCode: request.body?.metricCode
          },
          resultMessage: "创建作物目标区间"
        });

        return ok({ insertId: result.insertId }, "推荐目标创建成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.put(
    "/api/v1/crop-knowledge/targets/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      try {
        const targetId = parseInteger(request.params.id);
        const selection = await resolveCropTargetSelection(request.auth, request.body);
        const tenantId = selection.tenantId;
        if (!targetId) {
          return fail(reply, 400, "无效的目标ID");
        }

        const result = await query(
          `UPDATE agri_crop_target_profiles
           SET species_id = ?, variety_id = ?, stage_id = ?, metric_code = ?, target_min = ?, target_max = ?,
               optimal_value = ?, tolerance_text = ?, advisory_text = ?, source_name = ?, sort_order = ?, status = ?
           WHERE id = ?
             AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
          [
            selection.speciesId,
            selection.varietyId,
            selection.stageId,
            selection.metricCode,
            toNullableNumber(request.body?.targetMin),
            toNullableNumber(request.body?.targetMax),
            toNullableNumber(request.body?.optimalValue),
            optionalString(request.body?.toleranceText),
            optionalString(request.body?.advisoryText),
            optionalString(request.body?.sourceName),
            parseInteger(request.body?.sortOrder, 100),
            normalizeEnabled(request.body?.enabled, true) ? "enabled" : "disabled",
            targetId,
            ...(tenantId ? [tenantId] : [])
          ]
        );
        if (result.affectedRows === 0) {
          return fail(reply, 404, "未找到推荐目标", "not_found");
        }

        await logOperation(request, {
          moduleCode: "crop_target",
          operationType: "update",
          targetType: "agri_crop_target_profiles",
          targetId,
          requestParams: {
            metricCode: request.body?.metricCode
          },
          resultMessage: "更新作物目标区间"
        });

        return ok({ id: targetId }, "推荐目标更新成功");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.delete(
    "/api/v1/crop-knowledge/targets/:id",
    {
      preHandler: [app.requirePermissions(["system:config"])]
    },
    async (request, reply) => {
      const targetId = parseInteger(request.params.id);
      const tenantId = await getCropKnowledgeTenantId(request.auth);
      if (!targetId) {
        return fail(reply, 400, "无效的目标ID");
      }

      await query(
        `DELETE FROM agri_crop_target_profiles
         WHERE id = ?
           AND tenant_id ${tenantId ? "= ?" : "IS NULL"}`,
        [targetId, ...(tenantId ? [tenantId] : [])]
      );
      return ok({ id: targetId }, "推荐目标删除成功");
    }
  );

  app.get(
    "/api/v1/crop-knowledge/recommendation-snapshots",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.query?.areaId);
        const limit = Math.min(Math.max(parseInteger(request.query?.limit, 10) || 10, 1), 50);
        const filters = [];
        const params = [];

        if (areaId) {
          filters.push("s.area_id = ?");
          params.push(areaId);
        }
        appendTenantScope(filters, params, request.auth, "s.tenant_id");
        appendAreaScope(filters, params, request.auth, "s.area_id");

        const rows = await query(
          `SELECT
             s.id,
             s.snapshot_no AS snapshotNo,
             s.area_id AS areaId,
             a.area_name AS areaName,
             a.area_code AS areaCode,
             s.recommendation_status AS recommendationStatus,
             s.report_level AS reportLevel,
             s.report_title AS reportTitle,
             s.summary_text AS summaryText,
             s.crop_text AS cropText,
             s.stage_text AS stageText,
             s.weather_status AS weatherStatus,
             s.weather_summary AS weatherSummary,
             s.weather_snapshot_json AS weatherSnapshotJson,
             s.metrics_snapshot_json AS metricsSnapshotJson,
             s.actions_snapshot_json AS actionsSnapshotJson,
             s.created_by AS createdBy,
             COALESCE(s.created_by_name, u.real_name, u.username) AS createdByName,
             s.created_at AS createdAt
           FROM agri_crop_recommendation_snapshots s
           LEFT JOIN biz_areas a ON a.id = s.area_id
           LEFT JOIN sys_users u ON u.id = s.created_by
           ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
           ORDER BY s.created_at DESC, s.id DESC
           LIMIT ${limit}`,
          params
        );

        return ok(rows.map(formatRecommendationSnapshotRow));
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.post(
    "/api/v1/crop-knowledge/recommendation-snapshots",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.body?.areaId);
        if (!areaId) {
          return fail(reply, 400, "areaId不能为空");
        }

        const recommendation = await buildCropRecommendation(areaId, request.auth);
        const snapshot = buildRecommendationSnapshot(recommendation, request.auth);
        const result = await query(
          `INSERT INTO agri_crop_recommendation_snapshots
            (tenant_id, snapshot_no, area_id, recommendation_status, report_level, report_title, summary_text,
             crop_text, stage_text, weather_status, weather_summary, weather_snapshot_json, metrics_snapshot_json,
             actions_snapshot_json, created_by, created_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            snapshot.tenantId,
            snapshot.snapshotNo,
            snapshot.areaId,
            snapshot.recommendationStatus,
            snapshot.reportLevel,
            snapshot.reportTitle,
            snapshot.summaryText,
            snapshot.cropText,
            snapshot.stageText,
            snapshot.weatherStatus,
            snapshot.weatherSummary,
            stringifyJson(snapshot.weatherSnapshot),
            stringifyJson(snapshot.metricsSnapshot),
            stringifyJson(snapshot.actionsSnapshot),
            snapshot.createdBy,
            snapshot.createdByName
          ]
        );

        await logOperation(request, {
          moduleCode: "crop_recommendation",
          operationType: "snapshot",
          targetType: "agri_crop_recommendation_snapshots",
          targetId: result.insertId,
          requestParams: {
            areaId,
            snapshotNo: snapshot.snapshotNo,
            reportLevel: snapshot.reportLevel
          },
          resultMessage: "保存作物建议快照"
        });

        return ok({
          id: result.insertId,
          ...snapshot
        }, "作物建议快照已保存");
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );

  app.get(
    "/api/v1/crop-knowledge/recommendation",
    {
      preHandler: [app.authenticate]
    },
    async (request, reply) => {
      try {
        const areaId = parseInteger(request.query?.areaId);
        const currentTenantId = await getCropKnowledgeTenantId(request.auth);
        if (!areaId) {
          return fail(reply, 400, "areaId不能为空");
        }

        const filters = ["a.id = ?"];
        const params = [areaId];
        appendTenantScope(filters, params, request.auth, "a.tenant_id");
        appendAreaScope(filters, params, request.auth, "a.id");

        const areaRows = await query(
          `SELECT
             a.id,
             a.area_code AS areaCode,
             a.area_name AS areaName,
             a.crop_type AS cropType,
             a.growth_stage AS growthStage,
             a.crop_species_id AS cropSpeciesId,
             a.crop_variety_id AS cropVarietyId,
             a.crop_stage_id AS cropStageId,
             a.weather_location_name AS weatherLocationName,
             a.weather_provider_ref AS weatherProviderRef,
             a.latitude,
             a.longitude,
             s.species_name AS cropSpeciesName,
             v.variety_name AS cropVarietyName,
             g.stage_name AS cropStageName
           FROM biz_areas a
           LEFT JOIN agri_crop_species s ON s.id = a.crop_species_id
           LEFT JOIN agri_crop_varieties v ON v.id = a.crop_variety_id
           LEFT JOIN agri_crop_growth_stages g ON g.id = a.crop_stage_id
           WHERE ${filters.join(" AND ")}
           LIMIT 1`,
          params
        );

        const area = areaRows[0];
	        if (!area) {
	          return fail(reply, 404, "未找到区域或没有访问权限", "not_found");
	        }
	        const weather = await resolveRecommendationWeather(area, request.auth);
	
	        if (!area.cropSpeciesId || !area.cropStageId) {
	          return ok({
	            area,
	            status: "unconfigured",
	            summary: "当前区域尚未绑定作物品类和生长阶段，暂时无法生成推荐目标。",
	            metrics: [],
	            weather
	          });
	        }

        const targetRows = await query(
          `SELECT
             p.id,
             p.metric_code AS metricCode,
             p.target_min AS targetMin,
             p.target_max AS targetMax,
             p.optimal_value AS optimalValue,
             p.tolerance_text AS toleranceText,
             p.advisory_text AS advisoryText,
             p.source_name AS sourceName,
             p.variety_id AS varietyId,
             m.metric_name AS metricName,
             m.unit_name AS unitName
           FROM agri_crop_target_profiles p
           LEFT JOIN iot_metric_defs m ON m.metric_code = p.metric_code
           WHERE p.species_id = ?
             AND p.stage_id = ?
             AND p.status = 'enabled'
             ${currentTenantId ? "AND p.tenant_id = ?" : ""}
             AND (p.variety_id IS NULL OR p.variety_id = ?)
           ORDER BY CASE WHEN p.variety_id = ? THEN 0 ELSE 1 END, p.sort_order ASC, p.id ASC`,
          [
            area.cropSpeciesId,
            area.cropStageId,
            ...(currentTenantId ? [currentTenantId] : []),
            area.cropVarietyId || 0,
            area.cropVarietyId || 0
          ]
        );

        if (!targetRows.length) {
	          return ok({
	            area,
	            status: "no_targets",
	            summary: "当前作物/品种/阶段还没有配置推荐目标。",
	            metrics: [],
	            weather
	          });
	        }

        const targetMap = new Map();
        for (const row of targetRows) {
          if (!targetMap.has(row.metricCode)) {
            targetMap.set(row.metricCode, row);
          }
        }

        const readingRows = await query(
          `SELECT
             sr.metric_code AS metricCode,
             sr.metric_name AS metricName,
             sr.metric_value AS currentValue,
             sr.unit_name AS unitName,
             sr.collected_at AS collectedAt
           FROM iot_sensor_readings sr
           WHERE sr.area_id = ?
             AND sr.id = (
               SELECT inner_sr.id
               FROM iot_sensor_readings inner_sr
               WHERE inner_sr.area_id = sr.area_id
                 AND inner_sr.metric_code = sr.metric_code
               ORDER BY inner_sr.collected_at DESC, inner_sr.id DESC
               LIMIT 1
             )`,
          [areaId]
        );
        const readingMap = new Map(readingRows.map((row) => [row.metricCode, row]));

        const metrics = Array.from(targetMap.values()).map((target) => {
          const reading = readingMap.get(target.metricCode);
          const currentValue = reading ? Number(reading.currentValue) : null;
          const targetMin = toNullableNumber(target.targetMin);
          const targetMax = toNullableNumber(target.targetMax);
          let deviationStatus = "within";
          let deviationText = "处于建议范围内";

          if (currentValue === null || Number.isNaN(currentValue)) {
            deviationStatus = "missing";
            deviationText = "当前区域暂无该指标监测值";
          } else if (targetMin !== null && currentValue < targetMin) {
            deviationStatus = "low";
            deviationText = `低于建议下限 ${targetMin}`;
          } else if (targetMax !== null && currentValue > targetMax) {
            deviationStatus = "high";
            deviationText = `高于建议上限 ${targetMax}`;
          }

          return {
            metricCode: target.metricCode,
            metricName: target.metricName || target.metricCode,
            unitName: target.unitName || reading?.unitName || null,
            targetMin,
            targetMax,
            optimalValue: toNullableNumber(target.optimalValue),
            toleranceText: target.toleranceText || null,
            advisoryText: target.advisoryText || null,
            sourceName: target.sourceName || null,
            currentValue,
            collectedAt: reading?.collectedAt || null,
            deviationStatus,
            deviationText
          };
        });

        const lowCount = metrics.filter((item) => item.deviationStatus === "low").length;
        const highCount = metrics.filter((item) => item.deviationStatus === "high").length;
        const missingCount = metrics.filter((item) => item.deviationStatus === "missing").length;
        const summary = buildRecommendationSummary(area, { lowCount, highCount, missingCount, metricCount: metrics.length });

	        return ok({
	          area,
	          status: "ready",
	          summary,
	          metrics,
	          weather
	        });
      } catch (error) {
        return fail(reply, 400, error.message);
      }
    }
  );
}

async function buildCropRecommendation(areaId, authContext) {
  const currentTenantId = await getCropKnowledgeTenantId(authContext);
  const filters = ["a.id = ?"];
  const params = [areaId];
  appendTenantScope(filters, params, authContext, "a.tenant_id");
  appendAreaScope(filters, params, authContext, "a.id");

  const areaRows = await query(
    `SELECT
       a.id,
       a.tenant_id AS tenantId,
       a.area_code AS areaCode,
       a.area_name AS areaName,
       a.crop_type AS cropType,
       a.growth_stage AS growthStage,
       a.crop_species_id AS cropSpeciesId,
       a.crop_variety_id AS cropVarietyId,
       a.crop_stage_id AS cropStageId,
       a.weather_location_name AS weatherLocationName,
       a.weather_provider_ref AS weatherProviderRef,
       a.latitude,
       a.longitude,
       s.species_name AS cropSpeciesName,
       v.variety_name AS cropVarietyName,
       g.stage_name AS cropStageName
     FROM biz_areas a
     LEFT JOIN agri_crop_species s ON s.id = a.crop_species_id
     LEFT JOIN agri_crop_varieties v ON v.id = a.crop_variety_id
     LEFT JOIN agri_crop_growth_stages g ON g.id = a.crop_stage_id
     WHERE ${filters.join(" AND ")}
     LIMIT 1`,
    params
  );

  const area = areaRows[0];
  if (!area) {
    throw new Error("未找到区域或没有访问权限");
  }

  const weather = await resolveRecommendationWeather(area, authContext);
  if (!area.cropSpeciesId || !area.cropStageId) {
    return {
      tenantId: currentTenantId,
      area,
      status: "unconfigured",
      summary: "当前区域尚未绑定作物品类和生长阶段，暂时无法生成推荐目标。",
      metrics: [],
      weather
    };
  }

  const targetRows = await query(
    `SELECT
       p.id,
       p.metric_code AS metricCode,
       p.target_min AS targetMin,
       p.target_max AS targetMax,
       p.optimal_value AS optimalValue,
       p.tolerance_text AS toleranceText,
       p.advisory_text AS advisoryText,
       p.source_name AS sourceName,
       p.variety_id AS varietyId,
       m.metric_name AS metricName,
       m.unit_name AS unitName
     FROM agri_crop_target_profiles p
     LEFT JOIN iot_metric_defs m ON m.metric_code = p.metric_code
     WHERE p.species_id = ?
       AND p.stage_id = ?
       AND p.status = 'enabled'
       ${currentTenantId ? "AND p.tenant_id = ?" : ""}
       AND (p.variety_id IS NULL OR p.variety_id = ?)
     ORDER BY CASE WHEN p.variety_id = ? THEN 0 ELSE 1 END, p.sort_order ASC, p.id ASC`,
    [
      area.cropSpeciesId,
      area.cropStageId,
      ...(currentTenantId ? [currentTenantId] : []),
      area.cropVarietyId || 0,
      area.cropVarietyId || 0
    ]
  );

  if (!targetRows.length) {
    return {
      tenantId: currentTenantId,
      area,
      status: "no_targets",
      summary: "当前作物/品种/阶段还没有配置推荐目标。",
      metrics: [],
      weather
    };
  }

  const targetMap = new Map();
  for (const row of targetRows) {
    if (!targetMap.has(row.metricCode)) {
      targetMap.set(row.metricCode, row);
    }
  }

  const readingRows = await query(
    `SELECT
       sr.metric_code AS metricCode,
       sr.metric_name AS metricName,
       sr.metric_value AS currentValue,
       sr.unit_name AS unitName,
       sr.collected_at AS collectedAt
     FROM iot_sensor_readings sr
     WHERE sr.area_id = ?
       AND sr.id = (
         SELECT inner_sr.id
         FROM iot_sensor_readings inner_sr
         WHERE inner_sr.area_id = sr.area_id
           AND inner_sr.metric_code = sr.metric_code
         ORDER BY inner_sr.collected_at DESC, inner_sr.id DESC
         LIMIT 1
       )`,
    [areaId]
  );
  const readingMap = new Map(readingRows.map((row) => [row.metricCode, row]));

  const metrics = Array.from(targetMap.values()).map((target) => {
    const reading = readingMap.get(target.metricCode);
    const currentValue = reading ? Number(reading.currentValue) : null;
    const targetMin = toNullableNumber(target.targetMin);
    const targetMax = toNullableNumber(target.targetMax);
    let deviationStatus = "within";
    let deviationText = "处于建议范围内";

    if (currentValue === null || Number.isNaN(currentValue)) {
      deviationStatus = "missing";
      deviationText = "当前区域暂无该指标监测值";
    } else if (targetMin !== null && currentValue < targetMin) {
      deviationStatus = "low";
      deviationText = `低于建议下限 ${targetMin}`;
    } else if (targetMax !== null && currentValue > targetMax) {
      deviationStatus = "high";
      deviationText = `高于建议上限 ${targetMax}`;
    }

    return {
      metricCode: target.metricCode,
      metricName: target.metricName || target.metricCode,
      unitName: target.unitName || reading?.unitName || null,
      targetMin,
      targetMax,
      optimalValue: toNullableNumber(target.optimalValue),
      toleranceText: target.toleranceText || null,
      advisoryText: target.advisoryText || null,
      sourceName: target.sourceName || null,
      currentValue,
      collectedAt: reading?.collectedAt || null,
      deviationStatus,
      deviationText
    };
  });

  const lowCount = metrics.filter((item) => item.deviationStatus === "low").length;
  const highCount = metrics.filter((item) => item.deviationStatus === "high").length;
  const missingCount = metrics.filter((item) => item.deviationStatus === "missing").length;
  const summary = buildRecommendationSummary(area, { lowCount, highCount, missingCount, metricCount: metrics.length });

  return {
    tenantId: currentTenantId,
    area,
    status: "ready",
    summary,
    metrics,
    weather
  };
}

function buildRecommendationSnapshot(recommendation, authContext) {
  const area = recommendation.area || {};
  const metrics = Array.isArray(recommendation.metrics) ? recommendation.metrics : [];
  const issueMetrics = metrics.filter((item) => item.deviationStatus === "high" || item.deviationStatus === "low");
  const missingMetrics = metrics.filter((item) => item.deviationStatus === "missing");
  const cropText = [area.cropSpeciesName, area.cropVarietyName].filter(Boolean).join(" / ") || area.cropType || "未绑定作物";
  const stageText = area.cropStageName || area.growthStage || "未绑定生长阶段";
  const report = buildSnapshotReport({
    recommendation,
    cropText,
    stageText,
    issueMetrics,
    missingMetrics
  });
  const userId = parseInteger(authContext?.user?.id);
  const createdByName = optionalString(authContext?.user?.realName) || optionalString(authContext?.user?.username);

  return {
    tenantId: recommendation.tenantId || area.tenantId || null,
    snapshotNo: generateRecommendationSnapshotNo(),
    areaId: Number(area.id),
    recommendationStatus: recommendation.status || "ready",
    reportLevel: report.level,
    reportTitle: report.title,
    summaryText: report.summary,
    cropText,
    stageText,
    weatherStatus: recommendation.weather?.status || null,
    weatherSummary: recommendation.weather?.summary || null,
    weatherSnapshot: recommendation.weather || null,
    metricsSnapshot: metrics,
    actionsSnapshot: report.actions,
    createdBy: userId && userId > 0 ? userId : null,
    createdByName
  };
}

function buildSnapshotReport(context) {
  const { recommendation, cropText, stageText, issueMetrics, missingMetrics } = context;
  const actions = buildSnapshotActions(recommendation, { issueMetrics, missingMetrics });

  if (recommendation.status === "unconfigured") {
    return {
      level: "unconfigured",
      title: "区域未绑定作物阶段",
      summary: "当前区域尚未绑定作物品类和生长阶段，建议先完成区域作物配置。",
      actions
    };
  }

  if (recommendation.status === "no_targets") {
    return {
      level: "no_targets",
      title: "当前作物阶段缺少推荐目标",
      summary: "当前作物/品种/阶段还没有配置推荐目标，建议先维护温湿度、土壤和光照目标区间。",
      actions
    };
  }

  if (issueMetrics.length > 0) {
    return {
      level: "needs_action",
      title: `${cropText} · ${stageText} 有 ${issueMetrics.length} 项指标偏离`,
      summary: `建议优先处理 ${issueMetrics.slice(0, 3).map((item) => item.metricName || item.metricCode).join("、")}，再结合天气和现场巡检判断是否调整灌溉、通风或遮阴。`,
      actions
    };
  }

  if (missingMetrics.length > 0) {
    return {
      level: "data_gap",
      title: `${cropText} · ${stageText} 有 ${missingMetrics.length} 项指标缺少实时值`,
      summary: "建议先检查传感器上报链路，再将该建议用于自动化决策或日报分析。",
      actions
    };
  }

  return {
    level: "stable",
    title: `${cropText} · ${stageText} 当前状态平稳`,
    summary: recommendation.summary || "作物目标、实时数据和天气上下文暂无明显冲突，维持当前管理策略。",
    actions
  };
}

function buildSnapshotActions(recommendation, stats) {
  const actions = [];
  for (const metric of stats.issueMetrics.slice(0, 4)) {
    actions.push({
      type: "metric",
      level: "needs_action",
      label: metric.deviationStatus === "high" ? "偏高" : "偏低",
      title: metric.metricName || metric.metricCode,
      text: metric.advisoryText || metric.deviationText || "当前值偏离推荐区间，建议现场复核并调整管理策略。"
    });
  }

  for (const metric of stats.missingMetrics.slice(0, Math.max(0, 4 - actions.length))) {
    actions.push({
      type: "metric",
      level: "data_gap",
      label: "未接入",
      title: metric.metricName || metric.metricCode,
      text: "当前指标缺少实时值，建议检查传感器接入、网关上报或指标映射。"
    });
  }

  const weatherAction = buildSnapshotWeatherAction(recommendation.weather);
  if (weatherAction && actions.length < 5) {
    actions.push(weatherAction);
  }

  if (!actions.length) {
    actions.push({
      type: "management",
      level: "stable",
      label: "保持",
      title: "维持当前管理",
      text: "继续观察实时数据和天气变化，暂不建议调整灌溉、通风或遮阴策略。"
    });
  }

  return actions;
}

function buildSnapshotWeatherAction(weather) {
  const current = weather?.current || null;
  if (!weather || !current) {
    return {
      type: "weather",
      level: "data_gap",
      label: "天气",
      title: "补充天气上下文",
      text: weather?.summary || "天气服务暂无实时数据，建议先配置区域天气定位或经纬度。"
    };
  }

  if (Number(current.temperature) >= 32) {
    return {
      type: "weather",
      level: "needs_attention",
      label: "高温",
      title: "关注外部高温",
      text: "外部温度较高，若棚内温度也偏高，优先通风、遮阴和降温。"
    };
  }

  if (Number(current.relativeHumidity) >= 85) {
    return {
      type: "weather",
      level: "needs_attention",
      label: "高湿",
      title: "关注高湿病害风险",
      text: "外部湿度偏高，棚内若也高湿，建议加强通风除湿。"
    };
  }

  return {
    type: "weather",
    level: "stable",
    label: "天气",
    title: "天气暂无明显冲突",
    text: weather.summary || "当前天气未触发高温、高湿或降水提示。"
  };
}

function formatRecommendationSnapshotRow(row) {
  return {
    id: row.id,
    snapshotNo: row.snapshotNo,
    areaId: row.areaId,
    areaName: row.areaName,
    areaCode: row.areaCode,
    recommendationStatus: row.recommendationStatus,
    reportLevel: row.reportLevel,
    reportTitle: row.reportTitle,
    summaryText: row.summaryText,
    cropText: row.cropText,
    stageText: row.stageText,
    weatherStatus: row.weatherStatus,
    weatherSummary: row.weatherSummary,
    weatherSnapshot: parseSnapshotJson(row.weatherSnapshotJson, null),
    metricsSnapshot: parseSnapshotJson(row.metricsSnapshotJson, []),
    actionsSnapshot: parseSnapshotJson(row.actionsSnapshotJson, []),
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt
  };
}

function parseSnapshotJson(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "object" && !Buffer.isBuffer(value)) {
    return value;
  }
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function generateRecommendationSnapshotNo() {
  return `CRS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildRecommendationSummary(area, stats) {
  const cropLabel = [area.cropSpeciesName, area.cropVarietyName].filter(Boolean).join(" / ") || area.cropType || "未命名作物";
  const stageLabel = area.cropStageName || area.growthStage || "未命名阶段";
  const warnings = [];
  if (stats.lowCount > 0) {
    warnings.push(`${stats.lowCount} 项偏低`);
  }
  if (stats.highCount > 0) {
    warnings.push(`${stats.highCount} 项偏高`);
  }
  if (stats.missingCount > 0) {
    warnings.push(`${stats.missingCount} 项未接入`);
  }

  if (warnings.length === 0) {
    return `${area.areaName} 当前绑定 ${cropLabel} · ${stageLabel}，已配置 ${stats.metricCount} 项推荐目标，当前监测值整体处于建议范围内。`;
  }

  return `${area.areaName} 当前绑定 ${cropLabel} · ${stageLabel}，已配置 ${stats.metricCount} 项推荐目标，当前存在 ${warnings.join("、")}。`;
}

async function resolveRecommendationWeather(area, authContext) {
  try {
    return await resolveAreaWeather(area, {
      authContext
    });
  } catch (error) {
    return {
      status: "provider_error",
      summary: `天气上下文加载失败：${error.message}`,
      weatherEnabled: false,
      providerType: null,
      providerLabel: null,
      currentDateSource: "Asia/Shanghai",
      area: area
        ? {
            id: area.id,
            areaCode: area.areaCode || null,
            areaName: area.areaName || null,
            weatherLocationName: area.weatherLocationName || null,
            latitude: area.latitude ?? null,
            longitude: area.longitude ?? null
          }
        : null,
      current: null,
      location: null
    };
  }
}

module.exports = cropRoutes;
