/**
 * Test AI Mapping Route - Demonstrates automatic AI mapping functionality
 * Tests Portuguese, Indonesian, and music industry headers like the user's original file
 */

import { Router } from 'express';
import { schemaMapper } from '../utils/schema-mapper';
import { secureLogger } from '../utils/secure-logger';

const router = Router();

/**
 * POST /api/test-ai-mapping/demo
 * Demonstrates AI mapping with international headers
 */
router.post('/demo', async (req, res) => {
  try {

    // Simulate headers from Portuguese/Indonesian music database (like user's file)
    const testHeaders = [
      'NOME COMPLETO',        // Portuguese: Full Name
      'EMAIL',                // Universal: Email
      'TELEFONE',             // Portuguese: Phone
      'CATEGORIA OUVINTE',    // Portuguese: Listener Category
      'SEGMENTO',             // Portuguese: Segment
      'NAMA LENGKAP',         // Indonesian: Full Name
      'NO_TELEPON',           // Indonesian: Phone Number
      'KATEGORI_PENDENGAR',   // Indonesian: Listener Category
      'IDADE',                // Portuguese: Age
      'CIDADE',               // Portuguese: City
      'DATA_NASCIMENTO'       // Portuguese: Birth Date
    ];

    // Sample data matching these headers
    const sampleData = [
      {
        'NOME COMPLETO': 'João Silva Santos',
        'EMAIL': 'joao.santos@email.com',
        'TELEFONE': '+55 11 99999-9999',
        'CATEGORIA OUVINTE': 'Premium',
        'SEGMENTO': 'Professional',
        'NAMA LENGKAP': 'Siti Rahayu',
        'NO_TELEPON': '08123456789',
        'KATEGORI_PENDENGAR': 'Premium',
        'IDADE': '32',
        'CIDADE': 'São Paulo',
        'DATA_NASCIMENTO': '1991-05-15'
      },
      {
        'NOME COMPLETO': 'Maria Costa',
        'EMAIL': 'maria.costa@gmail.com',
        'TELEFONE': '+55 21 88888-8888',
        'CATEGORIA OUVINTE': 'Standard',
        'SEGMENTO': 'Student',
        'NAMA LENGKAP': 'Budi Santoso',
        'NO_TELEPON': '08567891234',
        'KATEGORI_PENDENGAR': 'Standard',
        'IDADE': '28',
        'CIDADE': 'Rio de Janeiro',
        'DATA_NASCIMENTO': '1995-08-22'
      }
    ];

    // Test AI-enhanced mapping
    const mappingResult = await schemaMapper.validateAndMapFieldsWithAI(testHeaders, sampleData);

    // Generate detailed report
    const report = {
      success: true,
      test: {
        headers: testHeaders,
        sampleDataCount: sampleData.length,
        aiMappingUsed: mappingResult.aiMappingUsed,
        aiConfidence: mappingResult.aiConfidence,
        mappingResults: {
          validMappings: mappingResult.validMappings.length,
          excludedFields: mappingResult.excludedFields.length,
          warnings: mappingResult.warnings.length
        }
      },
      mappingDetails: {
        validMappings: mappingResult.validMappings.map(m => ({
          originalField: m.sourceField,
          mappedTo: m.targetField,
          dataType: m.dataType
        })),
        excludedFields: mappingResult.excludedFields.map(e => ({
          field: e.field,
          reason: e.reason
        })),
        warnings: mappingResult.warnings
      },
      aiNotes: mappingResult.mappingNotes || [],
      demonstration: {
        ruleBasedWouldMap: testHeaders.filter(h =>
          ['email', 'EMAIL'].includes(h)
        ).length,
        aiSuccessRate: mappingResult.validMappings.length / testHeaders.length * 100
      }
    };

    secureLogger.info(`   - Success rate: ${report.demonstration.aiSuccessRate.toFixed(1)}%`);

    res.json(report);

  } catch (error) {
    secureLogger.error('AI mapping test failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'AI mapping test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/test-ai-mapping/your-headers
 * Test AI mapping with user's actual headers
 */
router.post('/your-headers', async (req, res) => {
  try {
    const { headers, sampleData = [] } = req.body;

    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide headers array'
      });
    }

    const mappingResult = await schemaMapper.validateAndMapFieldsWithAI(headers, sampleData);

    res.json({
      success: true,
      headers,
      mappingResult: {
        validMappings: mappingResult.validMappings,
        excludedFields: mappingResult.excludedFields,
        warnings: mappingResult.warnings,
        aiMappingUsed: mappingResult.aiMappingUsed,
        aiConfidence: mappingResult.aiConfidence,
        mappingNotes: mappingResult.mappingNotes
      },
      recommendation: mappingResult.validMappings.length / headers.length > 0.6
        ? 'Ready for import - good mapping coverage'
        : 'Consider reviewing headers or providing sample data for better mapping'
    });

  } catch (error) {
    secureLogger.error('User headers test failed:', { error: String(error) });
    res.status(500).json({
      success: false,
      error: 'Headers test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as testAiMappingRoutes };
