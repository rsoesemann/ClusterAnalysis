import { LightningElement, track, api } from 'lwc';
import predict from '@salesforce/apex/ClusterPredictController.predict';
import clustanUtilsUrl from '@salesforce/resourceUrl/clustanUtils';
import { loadScript } from 'lightning/platformResourceLoader';
import { NavigationMixin } from 'lightning/navigation';

const columns = [
    { label: 'Name', fieldName: 'name' },
    {
        label: 'Similarity',
        fieldName: 'similarity',
        type: 'percent',
        sortable: true,
        cellAttributes: { alignment: 'left' },
    },
    {
        label: 'Weight',
        fieldName: 'weight',
        type: 'percent',
        sortable: true,
        cellAttributes: { alignment: 'left' },
    },
];

export default class ClusterPredictResult extends NavigationMixin(LightningElement) {
    @api recordId;
    @api jobOrModelId;
    @api hideHeader = false;
    @track predictCluster;
    @track predictModel;
    @track predictionLoaded = false;
    @track errorMessage = '';
    @track similarityData;
    @track similarityValue;
    @track spinnerVisible = true;
    @track clusterPageUrl = '#';
    similarityColumns = columns;
    defaultSortDirection = 'asc';
    sortDirection = 'asc';
    sortedBy;

    connectedCallback() {
        if (this.recordId && this.jobOrModelId) {
            Promise.all([
                predict({
                    recordId: this.recordId,
                    jobOrModelId: this.jobOrModelId
                }),
                loadScript(this, clustanUtilsUrl + '/clustanUtils.js')
            ]).then(result => {
                this.predictCallback(result[0]);
            })
            .catch((error) => {
                this.handleError(error);
            });
        }
        else {
            this.handleError('Model or record are required for prediction');
        }
    }

    renderedCallback() {
        if (this.predictionLoaded) {
            let clusterbox = this.template.querySelector('div.clusterbox');
            if (clusterbox)
                clusterbox.style.backgroundColor = this.predictCluster.clusterColor;
        }
    }

    @api
    predict() {
        this.spinnerVisible = true;
        predict({
            recordId: this.recordId,
            jobOrModelId: this.jobOrModelId
        })
        .then(result => {
            this.predictCallback(result);
        })
        .catch((error) => {
            this.handleError(error);
        });
    }

    predictCallback(result) {
        this.spinnerVisible = false;
        this.predictCluster = result;
        this.predictCluster.jobState = JSON.parse(this.predictCluster.jobState);
        this.predictModel = this.predictCluster.jobState.model;
        clustanUtils.decompressDataPointValues(this.predictCluster.jobState, this.predictCluster.dataPoint);
        clustanUtils.decompressJobState(this.predictCluster.jobState);
        this.similarityValue = (100.0 - 100.0 * clustanUtils.gowerDistance(this.predictCluster.dataPoint.values, this.predictCluster.jobState.centroids[this.predictCluster.clusterIndex].values, this.predictCluster.jobState)).toFixed(2);
        let similarities = clustanUtils.calculateSimilarity(this.predictCluster.dataPoint.values, this.predictCluster.jobState.centroids[this.predictCluster.clusterIndex].values, this.predictCluster.jobState);
        this.similarityData = similarities
            .map((value, index) =>({ name: this.predictCluster.jobState.model.fields[index].name, similarity: value, weight: this.predictCluster.jobState.model.fields[index].weight}))
            .filter(item => item.similarity != null);        
        this.predictionLoaded = true;
        this[NavigationMixin.GenerateUrl]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.predictCluster.clusterId,
                actionName: 'view',
            },
        }).then(url => {
            this.clusterPageUrl = url;
        });
    }

    handleClusterLinkClick(event) {
        event.preventDefault();
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.predictCluster.clusterId,
                actionName: 'view',
            },
        });
    }

    handleError(error) {
        this.spinnerVisible = false;
        console.error(error);
        if (error.body && error.body.message) {
            this.errorMessage = error.body.message;
        }
        else if (error.message) {
            this.errorMessage = error.message;
        }
        else if (typeof error === 'string' || error instanceof String) {
            this.errorMessage = error;
        }
        else {
            this.errorMessage = JSON.stringify(error);
        }
    }

    sortBy(field, reverse, primer) {
        const key = primer
            ? function(x) {
                  return primer(x[field]);
              }
            : function(x) {
                  return x[field];
              };

        return function(a, b) {
            a = key(a);
            b = key(b);
            return reverse * ((a > b) - (b > a));
        };
    }

    onHandleSort(event) {
        const { fieldName: sortedBy, sortDirection } = event.detail;
        const cloneData = [...this.similarityData];

        cloneData.sort(this.sortBy(sortedBy, sortDirection === 'asc' ? 1 : -1));
        this.similarityData = cloneData;
        this.sortDirection = sortDirection;
        this.sortedBy = sortedBy;
    }
}