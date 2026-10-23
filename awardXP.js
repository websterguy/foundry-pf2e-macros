const config = {
  mode: 1, // 1 or 2.  1 = all PCs that are members of the active party. 2 = all PCs that have a player owner.
  ignoreMinions: true, // true/false, will not include anything with the minion or eidolon traits
  ignoreOffline: false, // true/false, will only include actors with an active player user owner
  adjustLevel: true, // true/false, will automatically increase/decrease level and adjust xp remaining
  includeChecklist: true // true/false, will provide a list of the actors with above settings to individually include/exclude
}

if (!validConfig()) {
  return ui.notifications.error('Config is broken');
}

const actors = (config.mode === 1 ? game.actors.party.members.filter(o => o.type === 'character' && minionCheck(o) && offlineCheck(o)) : game.actors.filter(o => o.type === 'character' && o.hasPlayerOwner && minionCheck(o) && offlineCheck(o)));
actors.sort((a,b) => { return a.name.localeCompare(b.name) });

const actorCheckboxes = config.includeChecklist ? actors.map(a => `
  <label class="checkbox">
    <input type="checkbox" name="selectedActors" value="${ a.id }" checked>
    <span>${ a.name }</span>
  </label>
`).join('') : '';

const content = `
  <form>
    <div class="form-group">
      <label>Base XP Award</label>
        <select name="awardAmount">
          <option value="0">Custom Only</option>
          <option value="40">Trivial encounter (40 exp)</option>
          <option value="60">Low encounter (60 exp)</option>
          <option value="80">Moderate encounter (80 exp)</option>
          <option value="120">Severe encounter (120 exp)</option>
          <option value="160">Extreme encounter (160 exp)</option>
          <option value="10">Minor accomplishment (10 exp)</option>
          <option value="30">Moderate accomplishment (30 exp)</option>
          <option value="80">Major accomplishment (80 exp)</option>
        </select>
    </div>
  
    <div class="form-group">
      <label>Custom Modifier</label>
      <input type="number" name="customValue" step="1" placeholder="Added to base">
    </div>
    
    ${ config.includeChecklist ? `
      <hr>
      <div class="form-group">
        <label>Actors</label>
        <div class="form-fields" style="flex-direction: column; align-items: start;">
          ${ actorCheckboxes }
        </div>
      </div>
      ` : ''
    }
  </form>
`;

const result = await foundry.applications.api.DialogV2.wait({
  window: {
    title: 'Award XP'
  },
  content,
  buttons: [
    {
      action: 'ok',
      label: 'Award It',
      callback: (event, button, dialog) => {
        const form = dialog.element.querySelector('form');

        const xpAmount = Number(form.querySelector('[name="awardAmount"]').value) + Number(          form.querySelector('[name="customValue"]').value || 0);

        const actorIds = [
          ...form.querySelectorAll(
            'input[name="selectedActors"]:checked'
          )
        ].map(cb => cb.value);

        return { xpAmount, actorIds };
      }
    },
    {
      action: 'cancel',
      label: 'Cancel'
    }
  ]
});

if (result === 'cancel' || result.xpAmount === 0) return;

const {xpAmount, actorIds} = result;

if (actorIds.length > 0) {
  const finalActors = actors.filter(a => actorIds.includes(a.id));
  let msg = `
    <b>${xpAmount} XP awarded to party!</b>
    <hr>
    <br>Recipients:
    <ul>
    `;
  const updates = [];
  for (const actor of finalActors) {
    msg += `<li>${actor.name}`;
    let newXP = actor.system.details.xp.value + xpAmount;
    let newLevel = actor.level;

    if (config.adjustLevel) {
      while (newXP >= actor.system.details.xp.max) {
        newXP -= actor.system.details.xp.max;
        newLevel += 1;
        msg += ` (Level up!)`;
      }
      while (newXP < actor.system.details.xp.min) {
        newXP += actor.system.details.xp.max;
        newLevel -= 1;
        msg += ` (Level down!)`;
      }
    }
    else {
      if (newXP < actor.system.details.xp.min) {
        msg += ` (Negative XP! ${newXP})`
      }
    }
    msg += `</li>`;
    updates.push({ _id: actor.id, 'system.details.xp.value': newXP, 'system.details.level.value': newLevel });
  }
  await Actor.updateDocuments(updates);
  msg += '</ul>';
  let chatMessageData = {
    user: game.user.id,
    content: msg,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER
  };
  ChatMessage.create(chatMessageData);
}

function validConfig() {
  return validMode(config.mode) && isBool(config.ignoreMinions) && isBool(config.ignoreOffline) && isBool(config.adjustLevel) && isBool(config.includeChecklist);
}

function minionCheck(c) {
  return !config.ignoreMinions || !['eidolon','minion'].some(t => c.system.traits.value.includes(t));
}

function offlineCheck(c) {
  return !config.ignoreOffline || game.users.players.filter(u => u.active).some(u => c.testUserPermission(u, "OWNER"));
}

function validMode(number) {
  return (+number === number && [1,2].includes(number));
}

function isBool(bool) {
  return !!bool === bool;
}
