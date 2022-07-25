
const readChunk = require('read-chunk');
const { fileTypeFromBuffer } = require('file-type');
const textFormat = ['csv', 'txt', 'html', 'htm', 'css', 'ini', 'json', 'tsv', 'xml', 'yaml', 'yml', 'rst', 'md'];

function toArrayBuffer(buf, length) {
    var ab = new ArrayBuffer(length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

function getHex(buff, length) {
    const blob = toArrayBuffer(buff, length);
    const uint = new Uint8Array(blob);
    let bytes = [];
    uint.forEach((byte) => {
        bytes.push(byte.toString(16));
    });
    const hex = bytes.join('').toUpperCase();
    return hex;
}

function validateTextFormat(options) {
    let len = 4;
    const blob = options.type == 'Binary' ? readChunk.readChunkSync(options.path, { length: len, startPosition: 0 }) : toArrayBuffer(options.data, len);
    const uint = new Uint8Array(blob);
    let bytes = [];
    uint.forEach((byte) => {
        bytes.push(byte.toString(16));
    });
    return !bytes.some(_b => {
        let hex = _b.toUpperCase();
        return (hex <= 0x08 || hex == 0x0B || (0x0E <= hex && hex <= 0x1A) || (0x1C <= hex && hex <= 0x1F));
    });
}

function validateOldMSOffice(options) {
    let len = 8;
    let hex = options.type == 'Binary' ? getHex(readChunk.readChunkSync(options.path, { length: len, startPosition: 0 }), len) : getHex(options.data, len);
    return hex == 'D0CF11E0A1B11AE1';
}

async function vatidateFile(options, ext) {
    if (textFormat.indexOf(ext) > -1) return true; //validateTextFormat(options);
    if (['doc', 'xls', 'ppt', 'msg'].indexOf(ext) > -1) return validateOldMSOffice(options);
    let buffer = options.type == 'Binary' ? readChunk.readChunkSync(options.path, { length: fileType.minimumBytes, startPosition: 0 }) : toArrayBuffer(options.data, fileType.minimumBytes);
    //remove BOM encoding
    if (ext == 'xml') {
        let hex = options.type == 'Binary' ? getHex(readChunk.readChunkSync(options.path, { length: 2, startPosition: 0 }), 3) : getHex(options.data, 3);
        if (hex == 'EFBBBF')
            buffer = buffer.slice(3);
    }
    let fileTypeObj = await fileTypeFromBuffer(buffer);
    if (!fileTypeObj) return false;
    if ((fileTypeObj.ext == 'jpg' || fileTypeObj.ext == 'jpeg') && (ext == 'jpg' || ext == 'jpeg')) return true;
    return fileTypeObj.ext == ext;
}

module.exports = vatidateFile;