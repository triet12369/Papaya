
/*jslint browser: true, node: true */
/*global */

"use strict";

/*** Imports ***/
var papaya = papaya || {};
papaya.volume = papaya.volume || {};


/*** Constructor ***/
papaya.volume.Header = papaya.volume.Header || function (pad) {
    this.fileFormat = null;
    this.imageDimensions = null;
    this.voxelDimensions = null;
    this.imageDescription = null;
    this.imageType = null;
    this.orientation = null;
    this.imageRange = null;
    this.error = null;
    this.origin = null;
    this.pad = pad;
    this.orientationCertainty = papaya.volume.Header.ORIENTATION_CERTAINTY_UNKNOWN;
    this.onFinishedFileFormatRead = null;
};


/*** Static Pseudo-constants ***/

papaya.volume.Header.HEADER_TYPE_UNKNOWN = 0;
papaya.volume.Header.HEADER_TYPE_NIFTI = 1;
papaya.volume.Header.HEADER_TYPE_DICOM = 2;
papaya.volume.Header.HEADER_TYPE_CORNERSTONE = 3;
papaya.volume.Header.ERROR_UNRECOGNIZED_FORMAT = "This format is not recognized!";
papaya.volume.Header.INVALID_IMAGE_DIMENSIONS = "Image dimensions are not valid!";
papaya.volume.Header.INVALID_VOXEL_DIMENSIONS = "Voxel dimensions are not valid!";
papaya.volume.Header.INVALID_DATATYPE = "Datatype is not valid or not supported!";
papaya.volume.Header.INVALID_IMAGE_RANGE = "Image range is not valid!";
papaya.volume.Header.ORIENTATION_CERTAINTY_UNKNOWN = 0;
papaya.volume.Header.ORIENTATION_CERTAINTY_LOW = 1;
papaya.volume.Header.ORIENTATION_CERTAINTY_HIGH = 2;
papaya.volume.Header.HAS_SHARED_BUFFER = function () {
    var ret = false;
    try {
        buffer = new SharedArrayBuffer(1);
        ret = true;
    } catch (err) {
        ret = false;
        console.warn('Cannot create SharedArrayBuffer, operating in single thread mode');
    }
    return ret;
}.call();

/*** Prototype Methods ***/

papaya.volume.Header.prototype.findHeaderType = function (filename, data) {
    if (filename === 'cornerstone')
        return papaya.volume.Header.HEADER_TYPE_CORNERSTONE;

    if (papaya.volume.nifti.HeaderNIFTI.isThisFormat(filename, data)) {
        return papaya.volume.Header.HEADER_TYPE_NIFTI;
    } else if (papaya.Container.DICOM_SUPPORT && papaya.volume.dicom.HeaderDICOM.isThisFormat(filename, data)) {
        return papaya.volume.Header.HEADER_TYPE_DICOM;
    }

    return papaya.volume.Header.HEADER_TYPE_UNKNOWN;
};



papaya.volume.Header.prototype.readHeaderData = function (filename, data, progressMeter, dialogHandler, stackMetadata,
                                                          onFinishedFileFormatRead) {
    // console.log('readHeaderData', filename, data);
    var headerType = this.findHeaderType(filename, data);
    console.log('header type', headerType);
    this.onFinishedFileFormatRead = onFinishedFileFormatRead;

    if (headerType === papaya.volume.Header.HEADER_TYPE_NIFTI) {
        this.fileFormat = new papaya.volume.nifti.HeaderNIFTI();
        this.fileFormat.readHeaderData(data, progressMeter, dialogHandler, papaya.utilities.ObjectUtils.bind(this, this.onFinishedHeaderRead));
    } else if (headerType === papaya.volume.Header.HEADER_TYPE_DICOM) {
        this.fileFormat = new papaya.volume.dicom.HeaderDICOM();
        this.fileFormat.readHeaderData(data, progressMeter, dialogHandler, papaya.utilities.ObjectUtils.bind(this, this.onFinishedHeaderRead));
    } else if (headerType === papaya.volume.Header.HEADER_TYPE_CORNERSTONE) {
        console.log('create Cornerstone header');
        this.fileFormat = new papaya.volume.dicom.HeaderCornerstone();
        this.fileFormat.readHeaderData(data, progressMeter, dialogHandler, stackMetadata, papaya.utilities.ObjectUtils.bind(this, this.onFinishedHeaderRead));
    } else {
        this.error = new Error(papaya.volume.Header.ERROR_UNRECOGNIZED_FORMAT);
        this.onFinishedFileFormatRead();
    }
};



papaya.volume.Header.prototype.onFinishedHeaderRead = function () {
    if (this.fileFormat.hasError()) {
        this.error = this.fileFormat.error;
        // console.log("fileFormat hasError");
    } else {
        this.imageType = this.fileFormat.getImageType();
        console.log('papaya-imageType', this.imageType);
        if (!this.imageType.isValid()) {
            this.error = new Error(papaya.volume.Header.INVALID_DATATYPE);
            // console.log("imageType hasError");
        }

        this.imageDimensions = this.fileFormat.getImageDimensions();
        if (!this.imageDimensions.isValid()) {
            this.error = new Error(papaya.volume.Header.INVALID_IMAGE_DIMENSIONS);
        }
        console.log('papaya-imageDimensions', this.imageDimensions);

        this.voxelDimensions = this.fileFormat.getVoxelDimensions();
        if (!this.voxelDimensions.isValid()) {
            this.error = new Error(papaya.volume.Header.INVALID_VOXEL_DIMENSIONS);
        }
        console.log('papaya-voxelDimensions', this.voxelDimensions);

        if (this.pad) {
            this.imageDimensions.padIsometric(this.voxelDimensions);
        }

        this.orientation = this.fileFormat.getOrientation();
        if (!this.orientation.isValid()) {
            this.orientation = new papaya.volume.Orientation(papaya.volume.Orientation.DEFAULT);
            this.orientationCertainty = papaya.volume.Header.ORIENTATION_CERTAINTY_UNKNOWN;
        } else {
            this.orientationCertainty = this.fileFormat.getOrientationCertainty();
        }

        this.orientation.createInfo(this.imageDimensions, this.voxelDimensions);
        console.log('papaya-orientation', this.orientation);

        this.origin = this.orientation.convertCoordinate(this.fileFormat.getOrigin(),
            new papaya.core.Coordinate(0, 0, 0));
        console.log('papaya-origin', this.origin);

        this.imageRange = this.fileFormat.getImageRange();
        if (!this.imageRange.isValid()) {
            this.error = new Error(papaya.volume.Header.INVALID_IMAGE_RANGE);
        }
        console.log('papaya-imageRange', this.imageRange);

        this.imageDescription = this.fileFormat.getImageDescription();
        console.log('papaya-imageDescription', this.imageDescription);

        // console.log('TROI OI LOI ROI', JSON.stringify(this.error));
    }

    this.onFinishedFileFormatRead();
};



papaya.volume.Header.prototype.getName = function () {
    return this.fileFormat.getName();
};



papaya.volume.Header.prototype.getSeriesLabels = function () {
    return this.fileFormat.getSeriesLabels();
};



papaya.volume.Header.prototype.readImageData = function (progressMeter, onFinishedImageRead) {
    this.fileFormat.readImageData(progressMeter, onFinishedImageRead);
};



papaya.volume.Header.prototype.hasError = function () {
    // console.log('Header.hasError', this.error);
    // console.log('sanity check', this.error !== null);
    return (this.error !== null);
};



papaya.volume.Header.prototype.getBestTransform = function () {
    return this.fileFormat.getBestTransform();
};



papaya.volume.Header.prototype.getBestTransformOrigin = function () {
    return this.fileFormat.getBestTransformOrigin();
};



papaya.volume.Header.prototype.toString = function () {
    return this.fileFormat.toString();
};