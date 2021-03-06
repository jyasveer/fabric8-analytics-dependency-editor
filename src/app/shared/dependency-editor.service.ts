import {
    Injectable,
    Inject,
    EventEmitter,
    Output
} from '@angular/core';
import {
    Response,
    Headers,
    RequestOptions
} from '@angular/http';
import {
    DependencyEditorTokenProvider
} from './depeditor-tokenprovider';
import { URLProvider } from './url-provider';
import { Subject } from 'rxjs/Subject';
import {
    Observable
} from 'rxjs/Observable';
import 'rxjs/add/operator/catch';
import 'rxjs/operators/map';
import 'rxjs/add/observable/fromPromise';
import * as _ from 'lodash';

import {
    StackReportModel,
    DependencySnapshotItem,
    ComponentInformationModel,
    CveResponseModel,
    DependencySearchItem,
    EventDataModel,
    LicenseStackAnalysisModel,
    ErrorUIModel,
    LicenseUIModel
} from '../model/data.model';
import {
    DependencySnapshot
} from '../utils/dependency-snapshot';

import { HttpInterceptor } from '../shared/http-interceptor';

@Injectable()
export class DependencyEditorService {
    @Output() dependencySelected = new EventEmitter < DependencySearchItem > ();
    @Output() dependencyRemoved = new EventEmitter < EventDataModel > ();

    licenseSubscription: Subject<LicenseUIModel | ErrorUIModel> = new Subject<LicenseUIModel | ErrorUIModel>();
    needsLicenseChange: Subject<boolean> = new Subject<boolean>();
    securitySubscription: Subject<CveResponseModel | ErrorUIModel> = new Subject<CveResponseModel | ErrorUIModel>();
    needsSecurityChange: Subject<boolean> = new Subject<boolean>();

    cacheHiddenDependency: Array<any> = [];

    private RECOMMENDER_API_BASE: string = '';
    private LICENSE_API_BASE: string = '';

    private URLS_HASH: any = {};

    constructor(
        private http: HttpInterceptor,
        private tokenProvider: DependencyEditorTokenProvider,
        private urlProvider: URLProvider
    ) {
        this.LICENSE_API_BASE = this.checkForTrailingSlashes(this.urlProvider.getLicenseAPIUrl());
        this.RECOMMENDER_API_BASE = this.checkForTrailingSlashes(this.urlProvider.getRecommenderAPIUrl());
        this.URLS_HASH = {
            'CVE': this.RECOMMENDER_API_BASE + 'api/v1/depeditor-cve-analyses',
            'LICENSE': this.LICENSE_API_BASE + 'api/v1/license-recommender',
            'DEPEDITORANALYSIS': this.RECOMMENDER_API_BASE + 'api/v1/depeditor-analyses/?persist=false'
        };
    }

    postStackAnalyses(githubUrl: string, githubRef: string): Observable<any> {
        const url = this.RECOMMENDER_API_BASE + 'api/v1/stack-analyses';
        return this.options.flatMap((option) => {
            // const payload = 'github_url=' + githubUrl;
            let payload: any;
            payload = 'github_url=' + githubUrl + '&source=osio' + '&github_ref=' + githubRef;
            option.headers.append('Content-Type', 'application/x-www-form-urlencoded');
            return this.http.post(url, payload, option)
                .map(this.extractData)
                .map((data) => {
                    return data;
                });
        });
    }

    getStackAnalyses(stackId: string): Observable < any > {
        if (!stackId) return;

        let url: string = this.RECOMMENDER_API_BASE + `api/v1/stack-analyses/${stackId}`;
        return this.options.flatMap((option) => {
            let stackReport: StackReportModel = null;
            return this.http.get(url, option)
                .map(this.extractData)
                .map((data) => {
                    stackReport = data;
                    return data;
                });
        });
    }

    getDependencies(component: string): Observable < any > {
        if (!component) return;

        let url: string = this.RECOMMENDER_API_BASE + `api/v1/component-search/${component}`;
        return this.options.flatMap((option) => {
            return this.http.get(url, option)
                .map(this.extractData)
                .map((data) => {
                    return data;
                });
        });
    }

    getDependencyData(type: string, payload: string): Observable < any > {
        let url: string = this.URLS_HASH[type];
        if (!url) return;

        return this.options.flatMap((option) => {
            return this.http.post(url, payload, option)
                .map(this.extractData)
                .map((data: StackReportModel | CveResponseModel | LicenseStackAnalysisModel | any) => {
                    return data;
                });
        });
    }

    getCategories(runtime: string): Observable < any > {
        if (!runtime) return;

        let url: string = this.RECOMMENDER_API_BASE + `api/v1/categories/${runtime}`;
        return this.options.flatMap((option) => {
            return this.http.get(url, option)
                .map(this.extractData)
                .map((data) => {
                    return data;
                });
        });
    }

    updateDependencyAddedSnapshot(depObj: EventDataModel) {
        let depToAdd: any = {};
        if (depObj.depFull) {
            depToAdd = {
                package: depObj.depFull.name,
                version: depObj.depFull.version
            };
            if (depObj.action === 'add') {
                DependencySnapshot.DEP_FULL_ADDED.push(depObj.depFull);
            }
        } else if (depObj.depSnapshot) {
            depToAdd = depObj.depSnapshot;
        }
        if (depObj.action === 'add') {
            DependencySnapshot.DEP_SNAPSHOT_ADDED.push(depToAdd);
        } else {
            _.remove(DependencySnapshot.DEP_SNAPSHOT_ADDED, (dep) => {
                return dep.package === depToAdd.package;
            });
            _.remove(DependencySnapshot.DEP_FULL_ADDED, (dep) => {
                return dep.name === depToAdd.package;
            });
        }
    }

    getPayload() {
        const payload: any = {};
        const deps = DependencySnapshot.DEP_SNAPSHOT.concat(DependencySnapshot.DEP_SNAPSHOT_ADDED);
        payload['_resolved'] = deps;
        payload['ecosystem'] = DependencySnapshot.ECOSYSTEM;
        payload['request_id'] = DependencySnapshot.REQUEST_ID;
        return payload;
    }

    removeDependency(dependency: ComponentInformationModel) {
        const objToEmit: EventDataModel = {
            depFull: dependency,
            depSnapshot: null,
            action: 'remove'
        };
        this.dependencyRemoved.emit(objToEmit);
    }

    private get options(): Observable<RequestOptions> {
        let headers = new Headers();
        return Observable.fromPromise(this.tokenProvider.token.then((token) => {
            headers.append('Authorization', 'Bearer ' + token);
            return new RequestOptions({
                headers: headers
            });
        }));
    }

    private extractData(res: Response) {
        const body = res.json() || {};
        body['statusCode'] = res.status;
        body['statusText'] = res.statusText;
        return body as StackReportModel;
    }

    private checkForTrailingSlashes(url: string): string {
        if (!url || url.length < 1) return;
        return url[url.length - 1] === '/' ? url : url + '/';
    }
}
