const XP_TARGET_DENSITY = 1000;

function calculateRuneAcquisition(rune, group, readRunePrice) {
  const directPrice = readRunePrice(rune);
  const options = [];

  if (directPrice) {
    options.push({
      kind: "buy",
      cost: directPrice,
      label: "Acheter HDV",
    });
  }

  if (group && rune.tierRank >= 2) {
    const lower = group.get(rune.tierRank - 1);
    const lowerPrice = lower ? readRunePrice(lower) : null;
    if (lower && lowerPrice) {
      options.push({
        kind: "craft",
        cost: lowerPrice * 3,
        label: `Crafter via 3 ${lower.name}`,
        quantity: 3,
        unitPrice: lowerPrice,
      });
    }
  }

  if (group && rune.tierRank === 3) {
    const simple = group.get(1);
    const simplePrice = simple ? readRunePrice(simple) : null;
    if (simple && simplePrice) {
      options.push({
        kind: "craft",
        cost: simplePrice * 9,
        label: `Crafter via 9 ${simple.name}`,
        quantity: 9,
        unitPrice: simplePrice,
      });
    }
  }

  options.sort((a, b) => a.cost - b.cost);
  const best = options[0] || null;
  const craftOptions = options.filter((option) => option.kind === "craft");
  const bestCraft = craftOptions[0] || null;
  const saving = directPrice && bestCraft ? directPrice - bestCraft.cost : null;
  const xpDirect = directPrice && rune.density > 0 ? rune.density / directPrice : null;
  const xpOptimal = best && rune.density > 0 ? rune.density / best.cost : null;

  let decision = "missing";
  let badge = "Prix requis";
  if (rune.density <= 0) {
    decision = "neutral";
    badge = "Hors XP";
  } else if (best && best.kind === "craft" && directPrice && best.cost < directPrice) {
    decision = "craft";
    badge = "Crafter";
  } else if (best && best.kind === "craft" && !directPrice) {
    decision = "craft";
    badge = "Craft possible";
  } else if (best && best.kind === "buy") {
    decision = "buy";
    badge = "Acheter";
  }

  return {
    directPrice,
    options,
    best,
    bestCraft,
    saving,
    profit: saving && saving > 0 ? saving : 0,
    xpDirect,
    xpOptimal,
    decision,
    badge,
  };
}

function getTargetDensityCost(rune, acquisition) {
  if (!acquisition.best || rune.density <= 0) return null;
  const quantity = Math.ceil(XP_TARGET_DENSITY / rune.density);
  return {
    quantity,
    cost: quantity * acquisition.best.cost,
    density: quantity * rune.density,
  };
}

function calculateItemEconomy(candidate, acquisition, itemPrice) {
  const runeCost = acquisition.best ? candidate.runeUses * acquisition.best.cost : null;
  const totalCost = itemPrice ? itemPrice + (runeCost || 0) : null;
  const costPerDensity = totalCost && candidate.potentialDensity > 0 ? (totalCost / candidate.potentialDensity) * XP_TARGET_DENSITY : null;

  return {
    itemPrice,
    runeCost,
    totalCost,
    costPerDensity,
  };
}

function calculateRecipeCost(ingredients, readPrice) {
  let total = 0;
  let missing = 0;
  const subtotals = ingredients.map(({ id, quantity }) => {
    const price = readPrice(id);
    if (price === null) {
      missing++;
      return null;
    }
    const subtotal = price * quantity;
    total += subtotal;
    return subtotal;
  });
  return { subtotals, total, missing };
}

function calculateEklameRows(eklames, target, readEklamePrice) {
  const targetIndex = eklames.findIndex((eklame) => eklame.id === target.id);

  return eklames.map((eklame, index) => {
    const directPrice = readEklamePrice(eklame);
    const canOpenToTarget = index >= targetIndex;
    const targetQuantity = canOpenToTarget ? eklame.factor / target.factor : null;
    const costPerTarget = directPrice && targetQuantity ? directPrice / targetQuantity : null;
    const action = !canOpenToTarget ? "Trop bas" : index === targetIndex ? "Acheter" : "Ouvrir";
    const decision = !canOpenToTarget ? "neutral" : costPerTarget ? (index === targetIndex ? "buy" : "craft") : "missing";

    return {
      eklame,
      directPrice,
      canOpenToTarget,
      targetQuantity,
      costPerTarget,
      action,
      decision,
    };
  });
}

function getOcrBestLot(result) {
  return result && result.best_lot ? result.best_lot : null;
}

function getOcrPracticalAverage(result) {
  const unitPrice = Number(result?.practical_average_unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return unitPrice;
}

function getOcrWeightedAverage(result) {
  const unitPrice = Number(result?.weighted_average_unit_price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return unitPrice;
}

function getOcrUnitPrice(result) {
  const unitPrice =
    getOcrPracticalAverage(result) ??
    getOcrWeightedAverage(result) ??
    Number(getOcrBestLot(result)?.unit_price);
  return Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null;
}

function getOcrApplyPrice(result) {
  const unitPrice = getOcrUnitPrice(result);
  return unitPrice === null ? null : Math.max(1, Math.round(unitPrice));
}

function getOcrMarketPrice(result) {
  return getOcrApplyPrice(result) ?? parsePrice(result?.displayed_average_price);
}
