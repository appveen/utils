const _ = require("lodash");

/**
 * 
 * @param {*} obj The Object to be flatten
 * @param {string} [parent] A parent key
 * 
 * @description This method take s nested JSON Object and flattens it to key-value pair.
 */
function flatten(obj, parent) {
    if (!obj) {
        obj = {};
    }
    let temp = {};
    Object.keys(obj).forEach(function (key) {
        const thisKey = parent ? parent + "." + key : key;
        if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            temp = Object.assign(temp, flatten(obj[key], thisKey));
        } else if (typeof obj[key] === "object" && Array.isArray(obj[key])) {
            obj[key].forEach((item, i) => {
                if (typeof item !== "object") {
                    temp[thisKey + "[" + i + "]"] = item;
                } else {
                    temp = Object.assign(temp, flatten(item, thisKey + "[" + i + "]"));
                }
            });
        } else {
            temp[thisKey] = obj[key];
        }
    });
    return temp;
};


/**
 * 
 * @param {*} obj The Object to be unFlatten
 * 
 * @description This method takes flatten JSON Object and unFlattens it to make nested Object.
 */
function unFlatten(obj) {
    if (!obj) {
        obj = {};
    }
    let temp = {};
    Object.keys(obj).forEach(_key => {
        let keys = _key.split(".");
        if (keys.length > 1) {
            keys.reverse();
            let tempObj = keys.reduce((p, c) => {
                if (c.endsWith("]")) {
                    const k = c.replace(/\[(.*)\]/, "");
                    const i = c.replace(/.*\[(.*)\]/, "$1");
                    const t = { [k]: [] };
                    t[k][i] = p;
                    return t;
                } else {
                    return { [c]: p };
                }
            }, obj[_key]);
            temp = _.merge(tempObj, temp);
        } else {
            if (_key.endsWith("]")) {
                const k = _key.replace(/\[(.*)\]/, "");
                temp[k] = [obj[_key]];
            } else {
                temp[_key] = obj[_key];
            }
        }
    });
    return temp;
}
module.exports.flatten = flatten;
module.exports.unFlatten = unFlatten;
