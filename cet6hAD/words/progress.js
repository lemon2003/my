/* progress.js —— 单元背诵进度（localStorage 持久化）
 *
 * 判定口径：本单元的每一个单词都"翻到过"，就算背过这个单元。
 * 记录的是"看到过哪些词的下标"，而不是"翻到第几个词"，
 * 这样即使中途点开一个靠后的词、或词库重建后顺序变化，进度也不会虚高。
 *
 * 存储键说明：v1 是按"每 100 词硬切"的单元编号记录的；v2 改成按 PDF 真实的
 * Word List 分节，单元编号含义变了；v3 换成完整的 16 个 Word List 词库（词序也变了），
 * 每次含义变化都升一版，旧记录直接作废，避免把新编号的列表错误地标成已背过。
 *
 * 数据结构：
 *   cet6hAD.progress.v3 = { version: 3, updatedAt: 时间戳, units: { "3": { seen: [0,1,2], updatedAt } } }
 */
(function (root) {
    'use strict';

    var KEY = 'cet6hAD.progress.v3';

    function storage() {
        try {
            return root.localStorage || null;
        } catch (e) {
            // 某些浏览器在禁用 Cookie 时访问 localStorage 会直接抛异常
            return null;
        }
    }

    function readUnits() {
        var store = storage();
        if (!store) return {};
        try {
            var raw = store.getItem(KEY);
            if (!raw) return {};
            var data = JSON.parse(raw);
            var units = data && data.units;
            if (!units || typeof units !== 'object') return {};
            return units;
        } catch (e) {
            return {};
        }
    }

    function writeUnits(units) {
        var store = storage();
        if (!store) return false;
        try {
            store.setItem(KEY, JSON.stringify({
                version: 3,
                updatedAt: Date.now(),
                units: units
            }));
            return true;
        } catch (e) {
            // 容量超限 / 隐私模式：静默降级，不影响正常学习
            return false;
        }
    }

    function keyOf(unitId) {
        return String(unitId);
    }

    // 读取某个单元"看到过的下标"，去重并丢弃非法值
    function readSeen(units, unitId) {
        var item = units[keyOf(unitId)];
        if (!item || !Array.isArray(item.seen)) return [];
        var out = [];
        for (var i = 0; i < item.seen.length; i++) {
            var n = item.seen[i];
            if (typeof n === 'number' && isFinite(n) && n >= 0) {
                n = Math.floor(n);
                if (out.indexOf(n) === -1) out.push(n);
            }
        }
        return out;
    }

    var Progress = {
        KEY: KEY,

        // 浏览器禁用存储时返回 false，调用方可据此降级（不影响页面功能）
        enabled: function () {
            return !!storage();
        },

        // 已看过的词数；只统计 [0, total) 范围内的下标，词库缩短后不会误判为已完成
        seenCount: function (unitId, total) {
            var limit = (typeof total === 'number' && total > 0) ? total : Infinity;
            var seen = readSeen(readUnits(), unitId);
            var n = 0;
            for (var i = 0; i < seen.length; i++) {
                if (seen[i] < limit) n++;
            }
            return n;
        },

        // 单元是否已背过
        isDone: function (unitId, total) {
            if (typeof total !== 'number' || total <= 0) return false;
            return this.seenCount(unitId, total) >= total;
        },

        // 记录"第 index 个词被翻到过"，返回是否产生了新记录
        markSeen: function (unitId, index, total) {
            if (typeof index !== 'number' || !isFinite(index) || index < 0) return false;
            if (typeof total === 'number' && total > 0 && index >= total) return false;
            index = Math.floor(index);

            var units = readUnits();
            var seen = readSeen(units, unitId);
            if (seen.indexOf(index) !== -1) return false;

            seen.push(index);
            units[keyOf(unitId)] = { seen: seen, updatedAt: Date.now() };
            writeUnits(units);
            return true;
        },

        // 统计已背过的单元数；units 为 [{ id, count }]
        doneCount: function (units) {
            var n = 0;
            for (var i = 0; i < units.length; i++) {
                if (this.isDone(units[i].id, units[i].count)) n++;
            }
            return n;
        },

        // 删除指定单元的记录（首页每个栏目各自的重置按钮用）
        clearUnits: function (ids) {
            var store = storage();
            if (!store) return false;
            if (!Array.isArray(ids) || !ids.length) return false;

            var units = readUnits();
            var removed = 0;
            for (var i = 0; i < ids.length; i++) {
                var k = keyOf(ids[i]);
                if (Object.prototype.hasOwnProperty.call(units, k)) {
                    delete units[k];
                    removed++;
                }
            }
            if (!removed) return false;
            return writeUnits(units);
        },

        // 删除全部背词记录（一键重置）
        clearAll: function () {
            var store = storage();
            if (!store) return false;
            try {
                store.removeItem(KEY);
                return true;
            } catch (e) {
                return false;
            }
        }
    };

    root.CET6Progress = Progress;
})(typeof window !== 'undefined' ? window : this);
