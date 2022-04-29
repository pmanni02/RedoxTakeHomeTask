#!/usr/bin/env node

const R = require('ramda');
const cli = require('commander');
const moment = require('moment');
const { fetchPRs, getPRs, clearPRs } = require('./index');

const isValidDateInput = (dates) => {
    let isValid = true;
    if(dates && dates.length == 2){
        dates.forEach(date => {            
            // validates date format with strict parsing
            const formatCheck = moment(date, 'M/D/YYYY', true);
            const validFormat = formatCheck.isValid();

            if(!validFormat){ isValid = false }
        });
    } else {
        isValid = false;
    }
    return isValid;
}

const validStateTimestampType = (state, timestampType) => {
    // valid combinations of state and timestamp type
    // eg: an invalid combo is state=open, timestamp type = closed. there will be no 
    //      closed timestamp on open PRs
    const validCombos = {
        'open': ['created', 'updated'],
        'closed': ['created', 'closed'],
        'merged': ['created', 'closed'],
        'all': ['created', 'updated', 'closed']
    }
    let validTypes = validCombos[state];
    return validTypes.includes(timestampType);
}

cli
    .description('Ramda Org Pull Request Console App')
    .addHelpText('after', `
Example calls:
    $ github-pr-cli fetch                                             - fetch PRs from GitHub
    $ github-pr-cli get all                                           - get number of all fetched PRs
    $ github-pr-cli get -s merged                                     - get number of all PRs with 'merged' state
    $ github-pr-cli get -s closed -l                                  - list PRs with 'closed' state
    $ github-pr-cli get -s closed -t created -d 3/1/2020 5/20/2022 -l - list PRs with 'closed' state that were created between 3/1/2020 5/20/2022
    $ github-pr-cli get -t closed -d 1/2/2015 1/3/2022 -l -s merged   - list PRs with 'merged' state that were closed between 1/2/2015 1/3/2022`)

cli
    .command('fetch')
    .description('fetch ALL PRs from Ramda Org via GitHub v3 API')
    .action(()=> {
        fetchPRs()
    });

cli
    .command('clear')
    .description('clear data stored in memory')
    .action(()=> {
        clearPRs()
    });

cli
    .command('get')
    .description('lookup data')
    .option('-s, --state <state>', 'filter by current state ("open", "closed", "merged") - omit to get ALL', "all")
    .option('-l, --list', 'list the PRs', false)
    .option('-d, --date <date...>', "filter by date range - valid format: 'M/D/YYY'")
    .option(
        '-t, --timestamp-type <type>', 
        `filter date range by timestamp type ("created", "updated", "closed") - MUST be used with -date option`
    )
    .action((options) => {
        const { state, timestampType, date } = options;
        
        const validTypes = ["created", "updated", "closed"];
        const validStates = ["open", "closed", "merged", "all"];
        const validDateAndTime = (!date && timestampType) ? false : true;

        // validate user input
        if(!validStates.includes(state)){
            console.log('Invalid state');
            console.log('Valid states - open, closed, merged');
        } else if(!validDateAndTime){
            console.log('Timestamp type must be used with date flag - see examples')
        } else if(date && !isValidDateInput(date)){
            console.log('Invalid date(s) - see examples');
        } else if(timestampType && !validTypes.includes(timestampType)){
            console.log('Invalid timestamp type');
            console.log('Valid types - created, updated, closed')
        } else if (state && timestampType && !validStateTimestampType(state, timestampType)){
            console.log('Invalid state and timestamp type combination - see examples');
        } else {
            // fetch date with valid input
            getPRs(options);
        }
    });

cli.parse(process.argv);