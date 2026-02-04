#!/usr/bin/env node
import LitheDB from './LitheDB.js';

async function run() {
  const args = process.argv.slice(2);
  const options = {
    db: 'database.json',
    pretty: false,
    format: 'json',
    populate: false,
    unique: false,
    ref: null,
    refField: 'id',
    sort: null,
    limit: null,
  };

  const commandArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-d' || arg === '--db') {
      options.db = args[++i];
    } else if (arg === '-p' || arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '-f' || arg === '--format') {
      options.format = args[++i];
    } else if (arg === '--populate') {
      options.populate = true;
    } else if (arg === '--unique') {
      options.unique = true;
    } else if (arg === '--ref') {
      options.ref = args[++i];
    } else if (arg === '--ref-field') {
      options.refField = args[++i];
    } else if (arg === '--sort') {
      options.sort = JSON.parse(args[++i]);
    } else if (arg === '--limit') {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      return;
    } else {
      commandArgs.push(arg);
    }
  }

  if (commandArgs.length === 0) {
    printHelp();
    return;
  }

  const [command, collectionName, ...rest] = commandArgs;

  try {
    const db = await LitheDB.create(options.db);

    switch (command) {
      case 'insert': {
        if (!collectionName || !rest[0]) throw new Error('Usage: insert <collection> <json>');
        const data = JSON.parse(rest[0]);
        const result = await db.collection(collectionName).insert(data);
        printResult(result, options);
        break;
      }
      case 'find': {
        if (!collectionName) throw new Error('Usage: find <collection> [query_json]');
        const query = rest[0] ? JSON.parse(rest[0]) : {};
        let results = await db.collection(collectionName).find(query, {
          populate: options.populate,
          sort: options.sort
        });
        if (options.limit !== null) {
          results = results.slice(0, options.limit);
        }
        printResult(results, options);
        break;
      }
      case 'findOne': {
        if (!collectionName || !rest[0]) throw new Error('Usage: findOne <collection> <query_json>');
        const query = JSON.parse(rest[0]);
        const result = await db.collection(collectionName).findOne(query, {
          populate: options.populate
        });
        printResult(result, options);
        break;
      }
      case 'update': {
        if (!collectionName || !rest[0] || !rest[1]) throw new Error('Usage: update <collection> <query_json> <update_json>');
        const query = JSON.parse(rest[0]);
        const updateData = JSON.parse(rest[1]);
        const count = await db.collection(collectionName).update(query, updateData);
        printResult({ updated: count }, options);
        break;
      }
      case 'remove': {
        if (!collectionName || !rest[0]) throw new Error('Usage: remove <collection> <query_json>');
        const query = JSON.parse(rest[0]);
        const count = await db.collection(collectionName).remove(query);
        printResult({ removed: count }, options);
        break;
      }
      case 'index': {
        const field = rest[0];
        if (!collectionName || !field) throw new Error('Usage: index <collection> <field> [--unique]');
        db.createIndex(collectionName, field, { unique: options.unique });
        await db._save();
        printResult({ message: `Index created on ${collectionName}.${field}` }, options);
        break;
      }
      case 'relation': {
        const field = rest[0];
        if (!collectionName || !field || !options.ref) throw new Error('Usage: relation <collection> <field> --ref <ref_collection> [--ref-field <field>]');
        db.defineRelation(collectionName, field, { ref: options.ref, field: options.refField });
        await db._save();
        printResult({ message: `Relation defined: ${collectionName}.${field} -> ${options.ref}.${options.refField}` }, options);
        break;
      }
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function printResult(result, options) {
  if (result === null || result === undefined) {
    console.log('null');
    return;
  }

  if (options.format === 'text') {
    if (Array.isArray(result)) {
      result.forEach((item, index) => {
        const id = item.id || 'N/A';
        console.log(`[ Record ${index + 1}: ${id} ]`);
        console.log(formatToText(item).trimStart());
        console.log('\n' + '-'.repeat(50) + '\n');
      });
    } else {
      console.log(formatToText(result).trimStart());
    }
  } else {
    console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
  }
}

function formatToText(data, indent = 0) {
  const spaces = '  '.repeat(indent);
  if (data === null) return 'null';
  if (typeof data !== 'object') return String(data);

  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    return `(Array[${data.length}])` + data.map(item => {
      return `\n${spaces}- ${formatToText(item, indent + 1).trimStart()}`;
    }).join('');
  }

  const keys = Object.keys(data);
  if (keys.length === 0) return '{}';

  const maxKeyLen = Math.max(...keys.map(k => k.length));
  return keys.map(key => {
    const val = data[key];
    const keyStr = key.padEnd(maxKeyLen);

    if (typeof val === 'object' && val !== null) {
      return `\n${spaces}${keyStr} : ${formatToText(val, indent + 1)}`;
    }
    return `\n${spaces}${keyStr} : ${val}`;
  }).join('');
}

function printHelp() {
  console.log(`
LitheDB CLI - AI-friendly lightweight JSON database

Usage:
  lithe-db <command> [collection] [arguments] [options]

Commands:
  insert <collection> <json>               Insert a new record
  find <collection> [query_json]           Find records matching query
  findOne <collection> <query_json>        Find the first record matching query
  update <collection> <query> <update>     Update records matching query
  remove <collection> <query>               Remove records matching query
  index <collection> <field>               Create an index (use --unique for unique constraint)
  relation <collection> <field>            Define a relation (requires --ref)

Options:
  -d, --db <path>       Database file path (default: database.json)
  -p, --pretty          Pretty print JSON output
  -f, --format <type>   Output format: json, text (default: json)
  --populate            Populate relations in find/findOne
  --sort <json>         Sort results (e.g. '{"id":"desc"}')
  --limit <n>           Limit number of results
  --unique              Used with 'index' command for unique constraint
  --ref <collection>    Referenced collection for 'relation' command
  --ref-field <field>   Referenced field for 'relation' command (default: id)
  -h, --help            Show this help message
`);
}

run();
