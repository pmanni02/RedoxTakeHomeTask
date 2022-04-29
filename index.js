const axios = require('axios');
const R = require('ramda');
const parse = require('parse-link-header');

const loki = require('lokijs');
let db = new loki('db.json', { env: 'NODEJS' });
let prs = db.addCollection("prs", { autoupdate: true });
require('dotenv').config()

// Base options for Github v3 Search API
const baseURL = 'https://api.github.com';
const baseOpts = {
    url: `${baseURL}/search/issues?q=is:pr+org:ramda`,
    method: 'get',
    headers: {
        "Authorization": `token ${process.env.API_KEY}`,
        "Accept":"application/vnd.github.v3+json"
    },
    params: {
        per_page: 100, //max 100, default 30
    }
}

// Top level properties to pull from returned Pull Request object
const topLevelProps = ['title', 'id', 'state', 'created_at', 'updated_at', 'closed_at', 'pull_request', 'user']

// Minimum properties to display to user
const minDisplayProps = ["title", "user", "created_at", "closed_at", "state"]

// Get total pages per query
async function getPages(queryModifier){
    let numPages = 1;
    try {
        let opts = Object.assign({}, baseOpts);
        opts.url = R.concat(opts.url, queryModifier);
        const res = await axios(opts)

        // parse link info from header object
        const parsed = parse(res.headers.link);
        if(parsed){
            numPages = parsed.last.page;
        }
    } catch (error) {
        console.log(error)
    }
    return numPages
}

// Transform timestamps into Date objects
const transformTimestamps = (data) => {
    const enUSFormat = new Intl.DateTimeFormat('en-US'); // M/D/YYYY
    const timestamps = ["created_at", "updated_at", "merged_at", "closed_at"];

    // creates an object with transformed dates for object merge with PR obj
    // adds timestamps as Date Objects and as epochTime for comparisons
    let dateObj = {};
    R.forEach(timestamp => {
        // save null instead of 'null' Date object val -> 1970-01-01T00:00:00.000Z
        const date = data[timestamp] ? new Date(data[timestamp]) : null;
        const formattedDate = date ? enUSFormat.format(date) : null;
        const epochTime = date ? date.valueOf() : null;
        dateObj[timestamp] = formattedDate;
        dateObj[`${timestamp}_e`] = epochTime;
    },timestamps);
    return R.mergeLeft(dateObj, data);
}

// Display data
//  data (obj)
//  showData (boolean) -> if true, list data
const display = (data, showData) => {
    if(showData){
        const minOutput = R.map(R.pick(minDisplayProps), data)
        console.table(minOutput)
    } 
    console.log(`Total: ${data.length}`);
}

// Fetch data from GitHub, transform, and save
async function requestData(queryModifier){
    // call to fetch link headers
    const pages = await getPages(queryModifier);
    let opts = Object.assign({}, baseOpts);
    opts.url = R.concat(opts.url, queryModifier);
    
    // make calls to get pages
    for(let i=1; i<=pages; i++){
        opts.params.page = i;
        try {            
            const res = await axios(opts);
            const filter = (pr) => {
                // pick out selected top level props
                const strippedData = R.pick(topLevelProps, pr);

                // move user name to base level
                const dataWithUser = R.assoc('user', strippedData.user.login, strippedData);

                // create merged status -> has a merged_at timestamp
                const mergedTime = strippedData['pull_request']['merged_at'];
                const dataWithMergedTS = R.assoc('merged_at', mergedTime, dataWithUser);

                // convert timestamps to Date object
                const fixedTimeStamp = transformTimestamps(dataWithMergedTS);
                
                // if the PR was merged, create a new state 'merged'. overwrites 'closed' state
                if(mergedTime){
                    const data = R.assoc('state', 'merged', fixedTimeStamp);
                    prs.insert(data);
                }else{
                    prs.insert(fixedTimeStamp);
                }
            }

            // for each returned PR obj, apply filters / transform data for storage
            R.forEach(filter, res.data.items);
            total = res.data.total_count;
            db.saveDatabase();

        } catch (error) {
            console.log(error)
        }
    }
}

// Fetch data - breakup requests for data by creation timestamp
// Due to github request limits for the search api (1000 results per search), the requests
//  are split by PR creation date. Each request returns < 1000 results
const fetchPRs = async () => {
    // year of first PR for Ramda Org 
        // - fetch dynamically for use of when any GitHub Org
    const firstPRYear = 2013; 
    const currentYear = parseInt(new Date().getFullYear());
    
    let queryStrs = []
    let year = firstPRYear;
    while(year <= currentYear - 1){
        let queryStr = `+created:${year}-01-01..${year+1}-12-31`;
        queryStrs = R.append(queryStr, queryStrs)
        year+=2
    }

    console.log('requesting data...')
    R.forEach(async (queryStr) => {
        console.log('...')
        await requestData(queryStr);
    }, queryStrs);
}

// Get data
//  options (obj) -> user input args and flags
const getPRs = async (options) => {
    const { state, list, date, timestampType } = options;
    db.loadDatabase({}, function(){
        let collection = db.getCollection('prs');
        let data;
        if(collection){
            // retrieve initial dataset
            if(state === "all"){
                data = collection.chain();
            } else {
                data = collection.chain().find({ state });
            }

            // filter dataset by dates and timestampType
            if(date){
                const epoch = R.map(date => new Date(date).valueOf(), date);
                const key = `${timestampType}_at_e`;
                data = data.find({ [key]: { '$between': epoch } });
            }

            data = data.data({removeMeta: true})
            display(data, list);
        }else{
            console.log('No data');
        }
    });
}

const clearPRs = async () => {
    db.loadDatabase({}, function(){
        db.getCollection("prs").clear({ removeIndices: true });
        db.saveDatabase();
    });
}

module.exports = {
    fetchPRs,
    getPRs,
    clearPRs
}