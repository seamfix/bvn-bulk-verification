/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Not, Repository } from 'typeorm';
import {
  IBody,
  IBulkVerificationDetails,
  IBulkVerificationUpdate,
  IProcessBulk,
  IRequestBody,
} from './interfaces';
import { BvnBulkVerifications } from 'src/entities/bvn_bulk_verifications';
import { BvnRecords } from 'src/entities/bvn_records';
import { BvnLookup } from 'src/entities/bvn_lookup';

@Injectable()
export class ProcessBvnService {
  constructor(
    @InjectRepository(BvnBulkVerifications)
    private readonly bvnBulkRepository: Repository<BvnBulkVerifications>,
    @InjectRepository(BvnRecords)
    private readonly bvnRecordsRepository: Repository<BvnRecords>,
    @InjectRepository(BvnLookup)
    private readonly bvnLookupRepository: Repository<BvnLookup>,
  ) {}

  delay = async (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  async initiateBulkRecordProcessing(body: IBody) {
    try {
      const bulkDetails = await this.bvnBulkRepository.query(`
              select * from bvn_bulk_verifications where pk = ${body.bulkFk}`);

      if (!bulkDetails[0]) {
        console.log(`Bulk with id ${body.bulkFk} not found`);
        return {
          code: 0,
          success: false,
          message: `Bulk with id ${body.bulkFk} not found`,
        };
      }

      if (
        bulkDetails[0].status?.toUpperCase() === 'COMPLETED' ||
        bulkDetails[0].status?.toUpperCase() === 'IN-PROGRESS'
      ) {
        Logger.log(`Bulk ${body.bulkFk} is ${bulkDetails[0].status}`);
        return {
          code: 0,
          success: false,
          message: `Bulk ${body.bulkFk} is ${bulkDetails[0].status}`,
        };
      }

      await this.bvnBulkRepository.update(
        { pk: Number(body.bulkFk) },
        { status: 'IN-PROGRESS' },
      );

      console.log(`Processing bulk ${body.bulkFk}`);

      const payload = {
        bulkId: Number(body.bulkFk),
        mode: bulkDetails[0].service_mode,
      };

      this.processBulkRequest(payload);

      return {
        code: 0,
        success: true,
        message: `Request received successfully, bulk ${body.bulkFk} is in progress`,
      };
    } catch (error) {
      console.log(
        `Error occurred for bulk ${body.bulkFk} with message ${error.message}`,
      );
      return {
        code: -1,
        success: false,
        message: error.message || 'Internal Server Error',
      };
    }
  }

  async processBulkRequest(body: IProcessBulk) {
    try {
      let isThereStilUnprocessedData = await this.isThereStillUnprocessedData(
        body.bulkId,
      );

      while (isThereStilUnprocessedData) {
        // Default to 500 if not set
        const batchSize = process.env.BATCH_SIZE
          ? parseInt(process.env.BATCH_SIZE, 10)
          : 500;

        // Select pending invocations with row locking and skip locked
        const invocationDetails = await this.getUnprocessedRecordsByBatch(
          body,
          batchSize,
        );

        const apiRequests: IRequestBody[] = invocationDetails.map((row) => ({
          bvn: row.search_parameter, // Map 'search_parameter' to 'bvn'
          invocationId: row.pk, // Map 'pk' to 'invocationId'
        }));

        await Promise.allSettled(
          apiRequests.map(async (request) => {
            try {
              await this.processBulkRecord(request, body.mode);
            } catch (error) {
              console.error(
                `Failed processing search parameter ${request.bvn} with invocation ID ${request.invocationId} with error message  ${error.message}`,
                error,
              );
            }
          }),
        );
        await this.delay(Number(process.env.DELAY_TIMEOUT));

        isThereStilUnprocessedData = await this.isThereStillUnprocessedData(
          body.bulkId,
        );
      }
      if (!isThereStilUnprocessedData) {
        console.log(`Finished processing bulk with id ${body.bulkId}`);
        await this.completeVerification(body.bulkId, body.mode);
        return;
      }
    } catch (error) {
      console.log(
        `Error processing bulk request for bulk ${body.bulkId} with message ${error.message}`,
      );
    }
  }

  async isThereStillUnprocessedData(pk: number): Promise<boolean> {
    const total = await this.bvnRecordsRepository.query(
      `SELECT COUNT(*) FROM bvn_records WHERE bulk_fk = $1 AND (job_status IS NULL OR job_status = 'PENDING')`,
      [pk],
    );

    const totalInvocations = parseInt(total[0].count, 10);

    const result = !!totalInvocations;
    return result;
  }

  async getUnprocessedRecordsByBatch(body: IProcessBulk, batchSize: number) {
    const query = `SELECT pk, search_parameter
            FROM bvn_records 
            WHERE (job_status IS NULL OR job_status = 'PENDING') 
            AND bulk_fk = $1
            ORDER BY created_date ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED`;

    const invocationDetails = await this.bvnRecordsRepository.query(query, [
      body.bulkId,
      batchSize,
    ]);

    const invocationPks = invocationDetails.map((row) => row.pk);

    const qUpdateInvocationsStatus = `UPDATE bvn_records
                                              SET job_status = 'IN_PROGRESS'
                                              WHERE pk = ANY($1::int[])`;
    await this.bvnRecordsRepository.query(qUpdateInvocationsStatus, [
      invocationPks,
    ]);
    return invocationDetails;
  }

  async processBulkRecord(record: IRequestBody, mode: string) {
    const { bvn, invocationId } = record;

    // Check lookup table
    const lookupID = await this.findInLookupTable(bvn);
    if (lookupID) {
      console.log(`BVN ${bvn} found in lookup table. Skipping API call.`);

      // Hardcoded statuses for records found in the lookup
      await this.updateInvocationTable(
        invocationId,
        'COMPLETED', // job_status
        'SUCCESSFUL', // transaction_status
        'SEARCH_FROM_DB', // retrieval_mode
        'VERIFIED', // status
      );
      return;
    }

    // If not in lookup table, make API call
    try {
      let response;
      if (mode.toLowerCase() === 'live') {
        response = await this.callThirdPartyAPI({
          bvn: bvn,
        });
      } else {
        console.log('Calling Mock API');

        response = await this.fetchMockResponse({
          bvn: bvn,
        });
      }

      console.log(
        `${mode.toLowerCase() === 'live' ? 'Live' : 'Mock'} Response for search parameter ${bvn} with response status: ${response === null ? 'null' : response.status}`,
      );

  

      if (response?.status === 200 && response?.data?.status === 'successful') {
        const { data } = response.data;

        const updateLookupTableQuery = `
          INSERT INTO bvn_lookup (
            "search_parameter", "first_name", "middle_name", "surname", "gender", "mobile", "date_of_birth", "photo"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT ("search_parameter") DO UPDATE
          SET "first_name" = EXCLUDED."first_name",
              "middle_name" = EXCLUDED."middle_name",
              "surname" = EXCLUDED."surname",
              "gender" = EXCLUDED."gender",
              "mobile" = EXCLUDED."mobile",
              "date_of_birth" = EXCLUDED."date_of_birth",
              "photo" = EXCLUDED."photo";
        `;

        // Insert or update the lookup table with the API response data
        await this.bvnLookupRepository.query(updateLookupTableQuery, [
          bvn,
          data.first_name,
          data.middle_name,
          data.last_name,
          data.gender,
          data.phone_number,
          data.dob,
          data.photoId,
        ]);

        // Update the invocation table with success details
        await this.updateInvocationTable(
          invocationId,
          'COMPLETED', // job_status
          'SUCCESSFUL', // transaction_status
          'THIRD_PARTY', // retrieval_mode
          'VERIFIED', // status
        );

        return;
      } else if (response?.status === 400) {
        await this.updateInvocationTable(
          invocationId,
          'COMPLETED', // job_status
          'SUCCESSFUL', // transaction_status
          'THIRD_PARTY', // retrieval_mode
          'NOT VERIFIED', // status
          response.data.message, // failure_reason
        );
        return;
      } else {
        await this.updateInvocationTable(
          invocationId,
          'COMPLETED', // job_status
          'FAILED', // transaction_status
          'THIRD_PARTY', // retrieval_mode
          'FAILED', // status
          'FAILED', // failure_reason
        );
        return;
      }
    } catch (error) {
      console.log(
        `Failed processing BVN ${bvn} with invocation ID ${invocationId}: error: ${error.message}`,
      );
      // Handling failures
      await this.updateInvocationTable(
        invocationId,
        'COMPLETED', // job_status
        'SUCCESSFUL', // transaction_status
        'THIRD_PARTY', // retrieval_mode
        'NOT VERIFIED', // status
        error.message, // failure_reason
      );
    }
  }

  async findInLookupTable(bvn: string) {
    const checkBvnQuery = `SELECT search_parameter FROM bvn_lookup WHERE search_parameter = $1 LIMIT 1`;
    const result = await this.bvnLookupRepository.query(checkBvnQuery, [bvn]);
    return result.length > 0 ? result[0].search_parameter : null;
  }

  async updateInvocationTable(
    invocationId: string,
    jobStatus: string,
    transactionStatus: string,
    retrievalMode: string,
    status: string,
    failureReason = null,
  ) {
    const updateQuery = `
      UPDATE bvn_records
      SET job_status = $1,
      transaction_status = $3,
      status = $2,
          retrieval_mode = $4,
          failure_reason = $5,
          modified_date = $7
      WHERE pk = $6
    `;
    try {
      await this.bvnRecordsRepository.query(updateQuery, [
        jobStatus,
        status,
        transactionStatus,
        retrievalMode,
        failureReason,
        invocationId,
        new Date(),
      ]);
    } catch (error) {
      console.log(
        `Error updating invocation table for invocation id ${invocationId} with error message ${error.message}`,
      );
    }
  }

  async callThirdPartyAPI(apiRequestPayload: { bvn: string }) {
    try {
      const url = `${process.env.MONO_BASEURL}/lookup/bvn`;
      const mono_sec_key = process.env.MONO_SEC_KEY;

      const response = await axios.post(url, apiRequestPayload, {
        headers: {
          'Content-Type': 'application/json',
          'mono-sec-key': mono_sec_key,
        },
      });
      return response;
    } catch (err) {
      console.log(`API call error: ${err.response?.data} OR ${err.message}`);
      return null;
    }
  }

  async fetchMockResponse(apiRequestPayload: { bvn: string }) {
    // Mock Success Response
    const foundSuccessResponse = {
      data: {
        status: 'successful',
        message: 'Lookup Successful',
        timestamp: '2024-12-11T15:53:06.045Z',
        data: {
          first_name: 'JUSTIN',
          last_name: 'ADAM',
          middle_name: 'ABEL',
          dob: '1901-06-15',
          phone_number: '08144618246',
          phone_number_2: '09057011067',
          email: 'justinabeladam2024@yopmail.com',
          gender: 'Male',
          state_of_origin: 'Lagos State',
          bvn: '22222222222',
          nin: null,
          registration_date: 'Invalid date',
          lga_of_origin: 'Eti Osa',
          lga_of_Residence: 'Eti Osa',
          marital_status: 'Single',
          watch_listed: false,
          photoId: 'https://randomuser.me/api/portraits/men/91.jpg',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    };

    const notFoundSuccessResponse = {
      data: {
        status: 'failed',
        message: 'Sorry, lookup failed. Please check the details and try again',
        timestamp: '2024-12-11T15:58:57.954Z',
      },
      status: 400,
      statusText: 'BAD REQUEST',
      headers: {},
      config: {},
    };

    // Mock Failure Response (400)
    const failureResponse = {
      data: {
        status: 'failed',
        message: 'Invalid bvn. please check and try again',
        timestamp: '2024-12-11T15:58:57.954Z',
      },
      status: 400,
      statusText: 'BAD REQUEST',
      headers: {},
      config: {},
    };

    // Mock Error Response (500)
    const errorResponse = {
      message: 'Network Error',
      response: null,
      status: 500,
    };

    let randomResponse: any;
    if (apiRequestPayload?.bvn.length < 11) {
      // "bvn" is shorter than 11 characters, simulate failure
      randomResponse = failureResponse;
    } else {
      // Randomly decide if it should be a success response or an error
      const randomChance = Math.random();

      if (randomChance > 0.9) {
        // 10% chance of a 500 error response
        randomResponse = errorResponse;
      } else {
        // 90% chance for either found or not found success response
        randomResponse =
          randomChance > 0.5 ? foundSuccessResponse : notFoundSuccessResponse;
      }
    }

    const delay = Math.floor(Math.random() * (100 - 10 + 1)) + 10; // Random delay between 10ms and 100ms

    // Return the response after the delay
    await new Promise((resolve) => setTimeout(resolve, delay));
    return randomResponse;
  }

  async completeVerification(bulkId: number, mode: string) {
    try {
      const incompleteCount = await this.bvnRecordsRepository.count({
        where: {
          bulkFk: { bulk_id: bulkId.toString() },
          job_status: Not('COMPLETED'),
        },
      });

      if (incompleteCount === 0) {
        // All records have been completed, update bulk verification table
        const currentDate = new Date();
        const bulkVerificationUpdate: IBulkVerificationUpdate = {
          status: 'COMPLETED',
          completion_date: currentDate.toISOString(),
          modified_date: currentDate.toISOString(),
          expiry_date: new Date(
            currentDate.getTime() + 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        };

        await this.bvnBulkRepository.update(
          { pk: bulkId },
          bulkVerificationUpdate,
        );

        const bulkDetails = await this.bvnBulkRepository.query(`
            select * from bvn_bulk_verifications  
            where pk = ${bulkId}`);

        if (mode === 'live') {
          // send email endpoint
          await this.sendEmail(`${bulkId}`);
        }
        if (bulkDetails[0]) {
          console.log(`Generating report for bulk with id ${bulkId}`);
          await this.generateReportAndUploadToS3({
            ...bulkDetails[0],
            wrapperFk: bulkDetails[0].wrapper_fk,
          });
        }
      }

      return incompleteCount;
    } catch (error) {
      console.error(error);
    }
  }

  async sendEmail(bulkId: string) {
    const payload = {
      bulkId,
    };

    const headersRequest = {
      Accept: 'application/json',
    };

    const url = `${process.env.NODE_SERVICE}/bulk-verification/bulk-notification-mail`;

    await axios.post(url, payload, {
      headers: headersRequest,
    });
  }

  async generateReportAndUploadToS3(body: IBulkVerificationDetails) {
    const payload = {
      wrapperFk: body.wrapperFk,
      pk: body.pk,
      filename: body.file_name,
    };

    const headersRequest = {
      Accept: 'application/json',
    };

    const url = `${process.env.NODE_SERVICE}/bulk-verification/upload-bulk-job-result`;

    await axios.post(url, payload, {
      headers: headersRequest,
    });
  }
}
