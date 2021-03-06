var mocksBaseApiUrl = '//aio.jamtech.cl/mocks/torrents.json'
var baseApiUrl = '//aio.jamtech.cl/v1/';
var defaultPages = 2;
var sessionCheckInterval = 60000 * 5; //5 minutes
var loops = 5;
var loginPath = "/login";
var user = localStorage.getItem('user') != null ? JSON.parse(localStorage.getItem('user')) : null;
var visibleDataRefreshInterval = 60000 * .5; //30 seconds
var dashboardChartLimit = 30;
var notifyTemplate = 'views/common/notify.html';
var atmsDistanceKms = 5;
var globalPosition = null;
var atmsMap = null;
var combustibleMap = null;
var atms = null;
var stations = null;
var loopsWaitInterval = 500;

function minimalize() {
    if (!$("body").hasClass("mini-navbar")) {
        $("body").toggleClass("mini-navbar");
    } else {
        $("body").removeClass("mini-navbar");
    }
}

function AtmsCtrl($scope, $rootScope, $http, $interval, $location, notify, Analytics, socialLoginService) {
    $scope.atms = [];
    $scope.availableTemplates = [{
            "name": "Map",
            "url": "views/atms_map.html",
            "iconClass": "fas fa-map"
        },
        {
            "name": "Table",
            "url": "views/atms_table.html",
            "iconClass": "fas fa-table"
        }
    ];
    $scope.gridTemplate = $scope.availableTemplates[0];
    $scope.setTemplate = function (template) {
        Analytics.trackEvent('atms', 'template', template.name);
        $scope.gridTemplate = template;
    };
    $scope.position = null;
    $scope.searchAtms = function () {
        var url = baseApiUrl + "Cajeros?distance=" + atmsDistanceKms;
        //add position
        if ($scope.position != null) {
            url += '&lat=' + $scope.position.coords.latitude;
            url += '&lng=' + $scope.position.coords.longitude;
        }
        return $http.get(url).then(function (response) {
            //console.log('searchAtms', response.data);
            $scope.atms = response.data;
            atms= response.data;
            return response.status == 200;
        }, function (response) {
            Alert('Error getting atms');
            console.log('Error getting atms', response, data);
            return false;
        });
    };

    //try to read geolocation from browser
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
                $scope.$apply(function () {
                    globalPosition = position;
                    $scope.position = position;
                    $scope.showLocationWarning = false;
                    Analytics.trackEvent('atms', 'geolocation', 'true');
                    $scope.searchAtms();
                });
            },
            function (error) {
                Analytics.trackEvent('atms', 'geolocation', 'false');
                $scope.showLocationWarning = true;
            });
    };
}

function DashboardCtrl($scope, $rootScope, $http, $interval, $location, notify, Analytics, socialLoginService) {
    Warning = function (msg) {
        if (notify != null) {
            notify({
                message: msg,
                classes: 'alert-warning',
                templateUrl: notifyTemplate
            });
        }
    };

    Alert = function (msg) {
        if (notify != null) {
            notify({
                message: msg,
                classes: 'alert-danger',
                templateUrl: notifyTemplate
            });
        }
    };

    Success = function (msg) {
        if (notify != null) {
            notify({
                message: msg,
                classes: 'alert-success',
                templateUrl: notifyTemplate
            });
        }
    }



    // Config notify behavior
    notify.config({
        duration: '5000'
    });

    $scope.safeApply = function (fn) {
        var phase = this.$root.$$phase;
        if (phase == '$apply' || phase == '$digest') {
            if (fn && (typeof (fn) === 'function')) {
                fn();
            }
        } else {
            this.$apply(fn);
        }
    };

    $scope.newSensor = {
        "Id": null
    };
    $scope.addSensor = function () {
        console.log('add new sensor', $scope.newSensor);
        var url = baseApiUrl + "Monitoring";
        var arr = [];
        arr.push($scope.newSensor);
        var data = JSON.stringify(arr);
        return $http.post(url, data).then(function (response) {
            Success('Sensor created');
            $scope.newSensor = {
                "Id": null
            };
            //console.log('sensor created', response);
            $scope.refreshSensors();
            return response.status == 200;
        }, function (response) {
            Alert('Error creating new sensor.');
            //console.log('error adding new sensor', response);
            return false;
        });
    };
    $scope.testSensor = function () {
        console.log('test new sensor', $scope.newSensor);
        var url = baseApiUrl + "Monitoring/test";
        var data = JSON.stringify($scope.newSensor);
        return $http.post(url, data).then(function (response) {
            var result = response.data;
            if (result)
                Success('Sensor OK');
            else
                Warning('Sensor Invalid');

            //console.log('sensor tested', response);
            return response.status == 200;
        }, function (response) {
            Alert('Error testing new sensor.');
            console.log('error testing new sensor', response, data);
            return false;
        });
    };
    $scope.sensors = null;
    $scope.selectedSensor = null;
    $scope.selectedSensorData = null;
    $scope.loadSelectedSensorData = function () {
        var sensorResultsData = $scope.selectedSensor != null ? $scope.selectedSensor.Results : [];
        //console.log('sensorResultsData', sensorResultsData);
        if (sensorResultsData) {
            var okData = sensorResultsData.filter(r => r.Success && r.Duration < $scope.selectedSensor.Config.WrnDuration).map(d => d.Duration);
            var wrnData = sensorResultsData.filter(r => r.Success && r.Duration >= $scope.selectedSensor.Config.WrnDuration && r.Duration < $scope.selectedSensor.Config.ErrDuration).map(d => d.Duration);
            var errData = sensorResultsData.filter(r => !r.Success || r.Duration >= $scope.selectedSensor.Config.ErrDuration).map(d => d.Duration);
            $scope.selectedSensorData = {
                labels: sensorResultsData != null ? sensorResultsData.map(d => new Date(d.Date).toLocaleTimeString()) : [],
                datasets: [{
                        label: "Duration OK",
                        fillColor: "transparent",
                        strokeColor: "green",
                        pointColor: "green",
                        data: okData
                    },
                    {
                        label: "Duration WRN",
                        fillColor: "transparent",
                        strokeColor: "orange",
                        pointColor: "orange",
                        data: wrnData
                    },
                    {
                        label: "Duration ERR",
                        fillColor: "transparent",
                        strokeColor: "red",
                        pointColor: "red",
                        data: errData
                    }
                ]
            };
        }
    }
    $scope.refreshSensors = function () {
        var url = baseApiUrl + "Monitoring/results?onlyErrors=false&resultsCount=" + dashboardChartLimit;
        if ($scope.sensorsTimer != null && user == null) {
            $scope.sensorsTimer = null;
        }
        return $http.get(url).then(function (response) {
            //console.log('status code', response.status);
            $scope.sensors = response.data;
            if ($scope.selectedSensor != null) {
                //refresh selected
                $scope.selectedSensor = $scope.sensors.filter(s => s.Config.Name == $scope.selectedSensor.Config.Name)[0];
                $scope.loadSelectedSensorData();
            }
            //console.log('sensors', $scope.sensors);
            return response.status == 200;
        }, function (response) {
            Alert('Error getting sensors results. ' + response.statusText);
            // console.log('err', response);
            return false;
        });
    };
    $scope.refreshSensors();
    $scope.sensorsTimer = $interval($scope.refreshSensors, visibleDataRefreshInterval);
    $scope.selectSensor = function (sensor) {
        Analytics.trackEvent('dashboard', 'viewSensor', sensor.Config.Name);
        if (sensor != $scope.selectedSensor) {
            $scope.selectedSensor = sensor;
            $scope.loadSelectedSensorData();
        } else
            $scope.selectedSensor = $scope.selectedSensorData = null;
    };

    $scope.getSensorGroupClass = function (sensor) {
        var result = sensor.Results.filter(r => r.Success == null || !r.Success);
        if (result.length > 0)
            return "btn-danger";
        else {
            //check durations
            if (sensor.Config.WrnDuration != null && sensor.Config.ErrDuration != null) {
                result = sensor.Results.filter(r => r.Duration >= sensor.Config.WrnDuration);
                if (result.length > 0)
                    return "btn-warning";
                result = sensor.Results.filter(r => r.Duration >= sensor.Config.ErrDuration);
                if (result.length > 0)
                    return "btn-danger";
            }
            return "btn-info";
        }
    };

    $scope.deleteSensor = function (sensor) {
        var url = baseApiUrl + "Monitoring/" + sensor.Config.Id;
        console.log('deleting sensor', sensor.Config);
        Analytics.trackEvent('dashboard', 'deleteSensor', sensor.Config.Name);
        return $http.delete(url).then(function (response) {
            Success("Sensor deleted");
            $scope.refreshSensors();
            return response.status == 200;
        }, function (response) {
            Alert('Error deleting sensor. ' + response.statusText);
            console.log('err', response);
            return false;
        });
    };

    /**
     * Options for Line chart
     */
    $scope.lineOptions = {
        scaleShowGridLines: true,
        scaleGridLineColor: "rgba(0,0,0,.05)",
        scaleGridLineWidth: 1,
        bezierCurve: true,
        bezierCurveTension: 0.4,
        pointDot: true,
        pointDotRadius: 4,
        pointDotStrokeWidth: 1,
        pointHitDetectionRadius: 20,
        datasetStroke: true,
        datasetStrokeWidth: 2,
        datasetFill: true
    };

}

function MainCtrl($scope, $rootScope, $http, $interval, $location, Analytics, socialLoginService) {
    $scope.checkUser = function () {
        if (user != null) {
            console.log('user logged in', user.name, user);
            if ($location.path() == loginPath) {
                $location.path("/");
            }
        } else {

            if ($location.path !== loginPath) {
                $location.path(loginPath);
            }
        }
    };
    $rootScope.$on("logoff", function () {
        $scope.logoff();
    });

    $scope.sessiontimer = null;
    this.helloText = 'Bienvenido a JAMTech.cl'
    this.descriptionText = '';
    $scope.user = user;
    $scope.checkSession = function () {
        if (user != null && (user.provider == "google" || user.provider == "facebook")) {
            console.log('checking session');
            var url = baseApiUrl + "User";
            //get stations from api.jamtech.cl
            return $http.get(url).then(function (response) {
                //console.log('status code', response.status);
                return response.status == 201;
            }, function (response) {
                user = null;
                $scope.user = user;
                $scope.sessiontimer = null;
                localStorage.setItem('user', user);
                console.log('session invalidated');
                $location.path(loginPath);
                return false;
            });
        };
    };

    $scope.checkSession();
    $scope.checkUser();

    $scope.minimalize = function () {
        if (!$("body").hasClass("mini-navbar")) {
            $("body").toggleClass("mini-navbar");
        } else {
            $("body").removeClass("mini-navbar");
        }
    };
    //$scope.minimalize();


    $scope.sessiontimer = $interval($scope.checkSession, sessionCheckInterval);
    $scope.logoff = function () {
        user = null;
        $scope.user = user;
        localStorage.setItem('user', user);
        socialLoginService.logout();
        $scope.sessiontimer = null;
        Analytics.set('&uid', null);
        $location.path(loginPath);
    };

    $rootScope.$on('event:social-sign-in-success', function (event, userDetails) {
        /*  Login ok */
        user = userDetails;
        $scope.user = user;
        localStorage.setItem('user', JSON.stringify(user));
        Analytics.set('&uid', user.uid);
        Analytics.trackEvent('aio', 'auth', user.provider);
        $scope.sessiontimer = $interval($scope.checkSession, sessionCheckInterval);
        console.log('social-sign-in-success');
        if (user.provider == "google") {
            $scope.$apply(function () {
                $scope.user = user;
            });
        }
        $location.path("/");
    });
    $rootScope.$on('event:social-sign-out-success', function (event, logoutStatus) {
        //logout ok
        console.log('social-sign-out-success');
        $scope.logoff();
        $location.path(loginPath);
    });
};

function TorrentsCtrl($http, $scope, $window, Analytics) {
    $scope.minimalize = minimalize;

    $scope.useMocks = false; //mocks mode
    var searchUrl = baseApiUrl + '../v2/Torrent?skipLinks=false&pages=' + defaultPages + '&search=';
    $scope.availableTorrentsTemplates = [{
        "name": "Table",
        "url": "views/torrents_table.html",
        "iconClass": "fas fa-table"
    }];
    $scope.gridTemplate = $scope.availableTorrentsTemplates[0];
    $scope.setTemplate = function (val) {
        Analytics.trackEvent('torrent', 'template', val.name);
        $scope.gridTemplate = val;
    }
    $scope.torrents = [];
    $scope.searchTorrents = function (val) {
        Analytics.trackEvent('torrent', 'search', val);
        var url = searchUrl + val;
        //using mocks for dev
        if ($scope.useMocks)
            url = mocksBaseApiUrl;

        return $http.get(url).then(function (response) {
            $scope.torrents = response.data;
            console.log('getTorrents', response.data)
            return true;
        });
    };
    $scope.download = function (val) {
        console.log('downloading', val);
        Analytics.trackEvent('torrent', 'download', val.Name);
        var url = val.Links.filter(link => link.Item2.startsWith('magnet:'));
        if (url.length > 0)
            $window.open(url[0].Item2, '_self');
    };
};

function ProductsCtrl($http, $scope, Analytics) {
    $scope.minimalize = minimalize;

    var searchUrl = baseApiUrl + 'Products?pages=' + defaultPages + '&product=';
    var compareUrl = baseApiUrl + 'JumboProducts/{productId}/compare';
    $scope.availableProductTemplates = [{
            "name": "Table",
            "url": "views/products_table.html",
            "iconClass": "fas fa-table"
        },
        {
            "name": "Grid",
            "url": "views/products_grid.html",
            "iconClass": "fas fa-th"
        }
    ];
    $scope.gridTemplate = $scope.availableProductTemplates[0];
    $scope.view = 'Search';
    $scope.textToSearch = null;
    $scope.position = null;
    $scope.showLocationWarning = false;
    $scope.products = [];
    $scope.setTemplate = function (val) {
        Analytics.trackEvent('product', 'template', val.name);
        $scope.gridTemplate = val;
    }
    $scope.searchProduct = function (product) {
        Analytics.trackEvent('product', 'search', product);
        $scope.textToSearch = product;
        var url = searchUrl + product;

        //get stations from api.jamtech.cl
        return $http.get(url).then(function (response) {
            $scope.products = response.data;
            $scope.view = 'Search';
            return true;
        });
    };
    //$scope.searchProduct('vino');

    $scope.viewProduct = function (product) {
        Analytics.trackEvent('product', 'view', product);
        var url = compareUrl.replace('{productId}', product.product_id);
        //get stations from api.jamtech.cl
        return $http.get(url).then(function (response) {
            $scope.products = response.data;
            $scope.view = 'Compare';
            return true;
        });
    };

    //try to read geolocation from browser
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
                $scope.$apply(function () {
                    $scope.position = position;
                    $scope.showLocationWarning = false;
                    Analytics.trackEvent('product', 'geolocation', 'true');
                });
            },
            function (error) {
                Analytics.trackEvent('product', 'geolocation', 'false');
                $scope.showLocationWarning = true;
            });
    };
}

function StationsCtrl($http, $scope, Analytics) {
    $scope.minimalize = minimalize;

    var stationsUrl = baseApiUrl + 'CombustibleStations?';
    var regionsUrl = baseApiUrl + 'CombustibleStations/Regiones';


    //defaults
    $scope.maxDistance = 10000; //in meters
    $scope.distributor = null;
    $scope.region = null; //all is the default //TODO read from cookie or calculate by location
    $scope.fuel = 'gasolina_95';
    $scope.fuelTypes = ["gasolina 93", "gasolina 95", "gasolina 97", "petroleo diesel", "kerosene", "glp vehicular"];
    $scope.distances = [1000, 5000, 10000, 15000, 20000, 50000, 100000];
    $scope.combustible = 'Vehicular';
    $scope.orderBy = 'precios.ranking_gasolina_95';
    $scope.regions = [];
    $scope.stations = [];
    $scope.showLocationWarning = false;

    /// Load parameters from local storage
    function loadFromLocalStorage() {
        var fuel = localStorage.getItem('fuel');
        if (fuel)
            $scope.fuel = fuel;
        var region = localStorage.getItem('region');
        if (region)
            $scope.region = JSON.parse(region);
        var combustible = localStorage.getItem('combustible');
        if (combustible)
            $scope.combustible = combustible;
        var distance = localStorage.getItem('distance');
        if (distance)
            $scope.maxDistance = distance;
        var distributor = localStorage.getItem('distributor');
        if (distributor)
            $scope.distributor = distributor;
    }
    loadFromLocalStorage();


    $scope.availableTemplates = [
        {
            "name": "Map",
            "url": "views/combustible_map.html",
            "iconClass": "fas fa-map"
        },
        {
            "name": "Table",
            "url": "views/combustible_table.html",
            "iconClass": "fas fa-table"
        },
        {
            "name": "Grid",
            "url": "views/combustible_grid.html",
            "iconClass": "fas fa-th"
        }
    ];
    $scope.gridTemplate = $scope.availableTemplates[0];
    $scope.setTemplate = function (val) {
        Analytics.trackEvent('combustible', 'template', val.name);
        $scope.gridTemplate = val;
    }

    $scope.setDistributor = function (val) {
        $scope.distributor = val;
        localStorage.setItem('distributor', val != null ? val : '');
        $scope.searchStations();
    }
    $scope.getDistributors = function () {
        if ($scope.stations != null) {
            var result = $scope.stations.map(m => m.distribuidor.nombre).filter(onlyUnique);
            return result;
        }
    }
    $scope.setDistance = function (val) {
        $scope.maxDistance = val;
        localStorage.setItem('distance', val != null ? val : '');
        $scope.searchStations();
    }
    $scope.setFuel = function (val) {
        $scope.fuel = val;
        localStorage.setItem('fuel', val != null ? val : '');
        $scope.searchStations();
    }
    $scope.setCombustible = function (val) {
        if (val == 'Vehicular')
            $scope.orderBy = 'precios.ranking_gasolina_95';
        else
            $scope.orderBy = 'precios.ranking_kerosene';
        $scope.combustible = val;
        localStorage.setItem('combustible', val != null ? val : '');
        $scope.searchStations();
    };
    $scope.setRegion = function (val) {
        $scope.region = val;
        localStorage.setItem('region', val != null ? JSON.stringify(val) : '');
        $scope.searchStations();
    };
    $scope.getFuelType = function () {
        if ($scope.fuel != null)
            return $scope.fuel;
        else
            return 'Todos los tipos';
    }
    $scope.getRegionName = function () {
        if ($scope.region != null)
            return $scope.region.nombre;
        else
            return 'Todas las regiones';
    }
    $scope.getDistributorName = function () {
        if ($scope.distributor)
            return $scope.distributor;
        else
            return 'Todas las marcas';
    }
    $scope.loadRegions = function () {
        return $http.get(regionsUrl).then(function (response) {
            $scope.regions = response.data;
            return true;
        });
    };
    $scope.loadRegions();

    $scope.searchStations = function () {
        Analytics.trackEvent('combustible', 'search', $scope.combustible);
        //refresh order by
        if ($scope.fuel != null)
            $scope.orderBy = 'precios.ranking_' + $scope.fuel.replaceAll(' ', '_');

        //add filters
        var tempStationsUrl = stationsUrl;
        tempStationsUrl += '&type=' + $scope.combustible;
        tempStationsUrl += '&order=' + $scope.orderBy;
        tempStationsUrl += '&region=';
        if ($scope.region != null)
            tempStationsUrl += $scope.region.codigo;
        else
            tempStationsUrl += '0';

        if ($scope.distributor != null)
            tempStationsUrl += '&distributor=' + $scope.distributor;

        //add position
        if ($scope.position != null) {
            tempStationsUrl += '&lat=' + $scope.position.coords.latitude + '&lng=' + $scope.position.coords.longitude;
            tempStationsUrl += '&filters=ubicacion.distancia<' + $scope.maxDistance;
        }

        //get stations from api.jamtech.cl
        return $http.get(tempStationsUrl).then(function (response) {
            $scope.stations = response.data;
            $scope.searchText = $scope.searchTextTemp;
            stations = response.data;
            return true;
        });
    };

    //try to read geolocation from browser
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
                $scope.$apply(function () {
                    $scope.position = position;
                    globalPosition = position;
                    $scope.showLocationWarning = false;
                    Analytics.trackEvent('product', 'geolocation', 'true');
                    $scope.searchStations();
                });
            },
            function (error) {
                //load stations without location
                $scope.searchStations();
                $scope.showLocationWarning = true;
                Analytics.trackEvent('product', 'geolocation', 'false');
            });
    };
}

function ToolsCtrl($scope, $rootScope, $http, Analytics) {
    $scope.minimalize = minimalize;
    $scope.curlMethod = "GET";

    $scope.pingResult = [];
    $scope.ping = function (hostname) {
        Analytics.trackEvent('tools', 'ping', hostname);
        var url = baseApiUrl + "Net/ping?hostname=" + hostname + "&loops=1";
        $http.post(url, null, null)
            .then(
                function (response) {
                    // success callback
                    $scope.pingResult = response.data;
                    console.log('ping ok', response.data);
                },
                function (response) {
                    // failure callback
                    console.log('fail', response.data);
                }
            );
    };

    $scope.telnetResult = [];
    $scope.telnet = function (hostname, port) {;
        Analytics.trackEvent('tools', 'telnet', hostname);
        $scope.loadingTelnet = true;
        var url = baseApiUrl + "Net/telnet/" + loops + "?hostname=" + hostname + "&port=" + port + "&timeout=2000";
        $http.post(url, null, null)
            .then(
                function (response) {
                    // success callback
                    $scope.telnetResult = response.data;
                    console.log('telnet ok', response.data);
                },
                function (response) {
                    // failure callback
                    console.log('fail', response.data);
                }
            ).then(function () {
                $scope.loadingTelnet = false;
            });
    };

    $scope.curlResult = null;
    $scope.curl = function (url, method) {
        $scope.loadingCurl = true;
        Analytics.trackEvent('tools', 'curl', url);
        if (url.endsWith(".js"))
            $scope.editorOptions.mode = "javascript";
        else if (url.endsWith(".xml"))
            $scope.editorOptions.mode = "xml";
        else if (url.endsWith(".css"))
            $scope.editorOptions.mode = "css";
        else
            $scope.editorOptions.mode = "htmlmixed";

        var url = baseApiUrl + "Net/curl?url=" + url + "&method=" + method + "&timeout=30000&useProxy=false";
        $http.post(url, null, null)
            .then(
                function (response) {
                    // success callback
                    switch ($scope.editorOptions.mode) {
                        case "javascript":
                            $scope.curlResult = js_beautify(response.data, {
                                indent_size: 2,
                                space_in_empty_paren: true
                            });
                        case "css":
                            $scope.curlResult = css_beautify(response.data, {
                                indent_size: 2,
                                space_in_empty_paren: true
                            });
                        default:
                            $scope.curlResult = html_beautify(response.data, {
                                indent_size: 2,
                                space_in_empty_paren: true
                            });
                    }
                    //console.log('curl ok', response.data);
                },
                function (response) {
                    // failure callback
                    $scope.curlResult = response.data;
                    console.log('fail', response.data);
                }
            ).then(function () {
                $scope.loadingCurl = false;
            });
    };

    $scope.editorOptions = {
        lineNumbers: true,
        matchBrackets: true,
        styleActiveLine: true,
        mode: "htmlmixed"
        //,theme:"ambiance"
    };
}

// End of controllers



//math operations used to calculate distnace between two points
function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

function getDistanceBetweenTwoPointsInMeters(lat1, lon1, lat2, lon2) {
    //console.log(lat1,lon1, lat2, lon2);
    var R = 6378100; // Radius of the earth in meters
    var dLat = deg2rad(lat2 - lat1); // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in meters
    return d;
};

function Capitalize() {
    return function (input) {
        return (!!input) ? input.charAt(0).toUpperCase() + input.substr(1).toLowerCase() : '';
    }
};


function toArray() {
    'use strict';
    return function (obj) {
        if (!(obj instanceof Object)) {
            return obj;
        }
        return Object.keys(obj).map(function (key) {
            return Object.defineProperty(obj[key], '$key', {
                __proto__: null,
                value: key
            });
        });
    }
};

function getProductBrandType() {
    return function (product) {
        return product.product_type + ' ' + product.brand;
    }
}

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}

function GetPrice() {
    return function (input) {

    }
}

function GetPrice() {
    return function (input) {
        return 'no price yet';
    }
};

function addMarker(location, text, map, uri) {
    var marker = new google.maps.Marker({
        position: location,
        title: text,
        map: map,
        url: uri
    });
    (function (marker) {
        google.maps.event.addListener(marker, "click", function (e) {
            console.log('open route to atm in new window');
            window.open(marker.url);
        });
    })(marker);
}

String.prototype.replaceAll = function (searchStr, replaceStr) {
    var str = this;

    // escape regexp special characters in search string
    searchStr = searchStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    return str.replace(new RegExp(searchStr, 'gi'), replaceStr);
};


//angular js - load controllers, filters and other stuff
angular
    .module('inspinia')
    .controller('MainCtrl', MainCtrl)
    .controller('StationsCtrl', StationsCtrl)
    .controller('ProductsCtrl', ProductsCtrl)
    .controller('TorrentsCtrl', TorrentsCtrl)
    .controller('ToolsCtrl', ToolsCtrl)
    .controller('DashboardCtrl', DashboardCtrl)
    .controller('AtmsCtrl', AtmsCtrl)
    .filter('capitalize', Capitalize)
    .filter('toArray', toArray)
    .filter('getBrand', getProductBrandType)
    .filter('getPrice', GetPrice);